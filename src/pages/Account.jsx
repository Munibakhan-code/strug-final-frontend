import React, { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { usePageBreadcrumb } from "../contexts/BreadcrumbContext.js";
import QRCode from "qrcode";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { UserSettingsIcon } from "../components/icons.jsx";
import { AddressAutocomplete, clickableProps } from "../components/shared.jsx";
import { Skel, SkeletonHeading } from "../components/skeletons.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { getMe, changePassword, applyReferralCode, getReferralEarnings, getReferralAnalytics, getMyReferralCode, getMyAppliedCode, updateUser, getWalletBalance, getAddresses, addAddress, deleteAddress, deleteMyAccount } from "../api/user";
import { TrendChart, RANGE_OPTIONS, KpiCard, DonutChart } from "../components/creatorAnalytics.jsx";
import { SegmentedControl } from "../components/providerKit.jsx";
import { formatCount } from "../utils/format.js";
import { timeAgo } from "../utils/time.js";
import { getSellerPortalStatus, getFoodVendorAnalytics, getSellerProductAnalytics, getServiceProviderAnalytics, getBookingHostAnalytics, getCreatorEarnings, getStreamerLiveAnalytics, getDriverAnalytics, getCourierAnalytics, getWorkerAnalytics } from "../api/analytics.js";
import { getMyOrders as getMyProductOrders } from "../api/shop";
import { normalizeBuyerProductOrder } from "../utils/shopBuyerHelpers.js";
import { getMyFoodOrders } from "../api/food";
import { getPassengerRideHistory, parsePassengerRideHistoryItems } from "../api/rideshare";
import { fmt, currencyForCountry } from "../utils/regionConfig.js";
import CountrySelect from "../components/CountrySelect.jsx";
import { getServiceOrders } from "../api/services";
import { getRentalOrders, declineRentalOrder, getAppointments } from "../api/realestate";
import { getMyTestDriveRequests } from "../api/vehicle";
import { getBookings, submitBookingReview, cancelBooking } from "../api/booking";
import { getWorkJobHistory, reviewWorkJob } from "../api/ondemandwork.js";
import { openOrderChat, openSupportChat } from "../api/chat";
import { updateProfilePhoto, updateSocialProfile, updateHandle, getMyProfile, setProfilePrivate, getBlockedUsers, unblockUser, getFollowRequests, acceptFollowRequest, rejectFollowRequest } from "../api/social";
import { getFriendActivityPrefs, updateFriendActivityPrefs, getWatchHistory } from "../api/videos";
import { isPushSupported, pushPermission, isSubscribed, subscribeToPush, unsubscribeFromPush, getPushPreferences, updatePushPreferences } from "../api/push";
import { getUser, getAuthUserId, getToken, setUser, clearAuth } from "../store/auth";
import { isDocumentVerified } from "../utils/documentVerified.js";
import { refreshAccessToken } from "../api/client";
import client from "../api/client";
import { revokeRefreshCookie } from "../api/auth";
import i18n from "../i18n/index.js";
import { useTranslation } from "react-i18next";
import { applyLanguage, syncLanguageFromUser } from "../utils/languagePrefs.js";
import { createSetupIntent, getPaymentMethods, removePaymentMethod } from "../api/payment";
import { LanguageSelect } from "../components/LanguageSelect.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { downloadOrderInvoice } from "../utils/invoice.js";
import {
	removeBlockedUserIdFromStorage,
	notifyBlockedUsersChanged,
} from "../utils/chatQuietPrefs.js";
import {
	isOrderHistoryInProgress,
	summarizeOrderHistory,
} from "../utils/orderHistoryStats.js";
import Pagination from "../components/Pagination.jsx";
import { exportOrdersCsv } from "../utils/ordersExport.js";
import { getDatingMe, updateDatingProfile } from "../api/dating.js";

const ORDERS_PAGE_SIZE = 10;

// #436: the opt-in work statuses a user can show on their profile. Must stay in sync with
// WORK_STATUSES in the backend's social-profile-routes.js, which validates the value.
const WORK_STATUSES = ["available_for_work", "open_to_opportunities", "hiring"];
const SETTINGS_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"];
const SETTINGS_DATE_FORMATS = ["mmddyyyy", "ddmmyyyy", "yyyymmdd"];
const SETTINGS_TIME_ZONES = [
  "utcMinus5Eastern",
  "utcMinus6Central",
  "utcMinus7Mountain",
  "utcMinus8Pacific",
  "utc0Gmt",
  "utcPlus1Cet",
  "utcPlus9Jst",
];
const adultCutoffValue = () => {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
};
const isAdultBirthdate = (value) => {
	if (!value) return false;
	const dob = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(dob.getTime())) return false;
	return dob <= new Date(`${adultCutoffValue()}T00:00:00Z`);
};
const apiMessage = (err) => err?.response?.data?.message ?? err?.response?.data?.error ?? err?.response?.data?.errors?.[0]?.message ?? err?.message ?? "";

function VerifiedIcon({ size = 16 }) {
	return (
		<span aria-label="Verified identity" title="Verified identity" style={{ color: "#fff", width: size, height: size, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: "#2563eb", flexShrink: 0 }}>
			<svg width={Math.max(10, size - 5)} height={Math.max(10, size - 5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
		</span>
	);
}
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function parseDateValue(value) {
	if (!value) return null;
	const [year, month, day] = String(value).split("-").map(Number);
	if (!year || !month || !day) return null;
	return { year, month: month - 1, day };
}

function isoDateValue(year, month, day) {
	return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatBirthdate(value) {
	const parsed = parseDateValue(value);
	if (!parsed) return "Select date of birth";
	return `${MONTH_LABELS[parsed.month]} ${parsed.day}, ${parsed.year}`;
}

function ThemedBirthdatePicker({ id, value, max, onChange, error }) {
	const [open, setOpen] = useState(false);
	const parsed = parseDateValue(value);
	const maxParsed = parseDateValue(max) || parseDateValue(adultCutoffValue());
	const [viewYear, setViewYear] = useState(parsed?.year || maxParsed?.year || new Date().getUTCFullYear() - 18);
	const [viewMonth, setViewMonth] = useState(parsed?.month ?? maxParsed?.month ?? 0);
	const wrapRef = useRef(null);
	const currentYear = maxParsed?.year || new Date().getUTCFullYear() - 18;
	const years = Array.from({ length: 101 }, (_, index) => currentYear - index);
	const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
	const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
	const maxIso = max || adultCutoffValue();
	const selectedIso = value || "";

	useEffect(() => {
		if (!open) return undefined;
		const handlePointer = (event) => {
			if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
		};
		const handleKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", handlePointer);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handlePointer);
			document.removeEventListener("keydown", handleKey);
		};
	}, [open]);

	useEffect(() => {
		if (!parsed) return;
		setViewYear(parsed.year);
		setViewMonth(parsed.month);
	}, [parsed?.year, parsed?.month]);

	const choose = (day) => {
		const next = isoDateValue(viewYear, viewMonth, day);
		if (next > maxIso) return;
		onChange(next);
		setOpen(false);
	};

	const shiftMonth = (delta) => {
		const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
		const nextYear = next.getUTCFullYear();
		const nextMonth = next.getUTCMonth();
		if (nextYear > currentYear || nextYear < currentYear - 100) return;
		setViewYear(nextYear);
		setViewMonth(nextMonth);
	};

	return (
		<div ref={wrapRef} style={{ position: "relative" }}>
			<button
				id={id}
				type="button"
				onClick={() => setOpen(v => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={`bg-surface-raised ${value ? "text-text-primary" : "text-text-muted"}`}
				style={{
					width: "100%",
					minHeight: 48,
					padding: "12px 14px",
					border: `1px solid ${error ? "#fb7185" : "var(--color-border)"}`,
					boxShadow: error ? "0 0 0 3px rgba(244,63,94,0.12)" : "inset 0 1px 0 var(--color-border)",
					borderRadius: 12,
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 14,
					fontWeight: 700,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					cursor: "pointer",
					textAlign: "left",
				}}
			>
				<span>{formatBirthdate(value)}</span>
				<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={error ? "#fb7185" : "var(--color-text-secondary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<path d="M16 2v4M8 2v4M3 10h18" />
				</svg>
			</button>
			{open && (
				<div
					role="dialog"
					aria-label="Choose date of birth"
					style={{
						position: "absolute",
						zIndex: 80,
						top: "calc(100% + 10px)",
						left: 0,
						width: "min(340px, 92vw)",
						// Kept permanently dark with its rose-tinted chrome (matches the rose active-date
						// gradient below) regardless of theme — a themed popup accent, not a neutral surface.
						background: "linear-gradient(160deg, rgba(36,18,25,0.98), rgba(13,13,18,0.98))",
						border: "1px solid rgba(244,63,94,0.28)",
						borderRadius: 18,
						boxShadow: "0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
						padding: 14,
					}}
				>
					{/* This whole dropdown (selects, day grid) is part of the permanently-dark rose-themed
					    popup above — colorScheme stays "dark" and colors stay hardcoded to match. */}
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
						<button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>‹</button>
						<div style={{ display: "flex", gap: 8, flex: 1 }}>
							<select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", padding: "8px 10px", fontWeight: 800, colorScheme: "dark" }}>
								{MONTH_LABELS.map((month, index) => <option key={month} value={index}>{month}</option>)}
							</select>
							<select value={viewYear} onChange={e => setViewYear(Number(e.target.value))} style={{ width: 92, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", padding: "8px 10px", fontWeight: 800, colorScheme: "dark" }}>
								{years.map(year => <option key={year} value={year}>{year}</option>)}
							</select>
						</div>
						<button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>›</button>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
						{WEEKDAY_LABELS.map((day, index) => (
							<div key={`${day}-${index}`} style={{ textAlign: "center", color: "rgba(255,255,255,0.42)", fontSize: 11, fontWeight: 900, padding: "4px 0" }}>{day}</div>
						))}
						{Array.from({ length: firstDay }).map((_, index) => <div key={`blank-${index}`} />)}
						{Array.from({ length: daysInMonth }).map((_, index) => {
							const day = index + 1;
							const iso = isoDateValue(viewYear, viewMonth, day);
							const active = iso === selectedIso;
							const disabled = iso > maxIso;
							return (
								<button
									key={iso}
									type="button"
									disabled={disabled}
									onClick={() => choose(day)}
									style={{
										aspectRatio: "1 / 1",
										borderRadius: 12,
										border: active ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.07)",
										background: active ? "linear-gradient(135deg, #f43f5e, #be123c)" : "rgba(255,255,255,0.045)",
										color: disabled ? "rgba(255,255,255,0.2)" : "#fff",
										fontWeight: 900,
										cursor: disabled ? "not-allowed" : "pointer",
										opacity: disabled ? 0.45 : 1,
									}}
								>
									{day}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function QrModal({ personalCode, onClose }) {
	const { t } = useTranslation();
	const refUrl = `https://strug.ca?ref=${encodeURIComponent(personalCode)}`;
	const qrCanvasCallback = useCallback((node) => {
		if (!node || !personalCode) return;
		QRCode.toCanvas(node, refUrl, { width: 220, margin: 2, color: { dark: "#000", light: "#fff" } }).catch(() => {});
	}, [personalCode, refUrl]);
	return (
		// Backdrop scrim stays a fixed black overlay in both themes — a standard modal-dimming
		// convention, not a themed surface.
		<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
			<div className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 28, textAlign: "center", maxWidth: 320, width: "100%" }} onClick={e => e.stopPropagation()}>
				<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 4 }}>{t("account.yourReferralQr")}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{t("account.scanToApplyCode")} <strong style={{ color: "#60a5fa" }}>{personalCode}</strong></p>
				{/* QR module colors are hardcoded #000/#fff above (QRCode.toCanvas) for scanner
				    contrast, so this quiet-zone box must stay white to match, in both themes. */}
				<div style={{ background: "#fff", borderRadius: 12, display: "inline-block", padding: 10, marginBottom: 20 }}>
					<canvas ref={qrCanvasCallback} style={{ display: "block" }} />
				</div>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 16, wordBreak: "break-all" }}>{refUrl}</p>
				<div style={{ display: "flex", gap: 10 }}>
					<button className="text-text-secondary border border-border" onClick={() => navigator.clipboard.writeText(refUrl).catch(() => {})} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t("account.copyLink")}</button>
					<button onClick={() => { if (navigator.share) navigator.share({ title: t("account.shareTitleMyStrug"), url: refUrl }).catch(() => {}); else navigator.clipboard.writeText(refUrl).catch(() => {}); }} style={{ color: "#fff", flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t("account.share")}</button>
				</div>
			</div>
		</div>
	);
}

function SavedRefCodesPage() {
	const { t } = useTranslation();
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad();
	const addCodeRef = React.useRef(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [copiedCode, setCopiedCode] = useState(null);
	const [addCodeInput, setAddCodeInput] = useState("");
	const [liveUser, setLiveUser] = useState(() => getUser());
	const [applyLoading, setApplyLoading] = useState(false);
	const [applyError, setApplyError] = useState("");
	const [showQrModal, setShowQrModal] = useState(false);
	const [applySuccess, setApplySuccess] = useState("");
	const [liveEarnings, setLiveEarnings] = useState(null);
	const [refUsageCount, setRefUsageCount] = useState(null);
	const [appliedFriendCodes, setAppliedFriendCodes] = useState([]);
	// Load the authoritative applied-codes list from the backend. The server stores the
	// canonical uppercase ref_code (and resolves usernames to it), so refetching after an
	// apply keeps the displayed code consistent with what shows on reload (#279).
	const loadAppliedCodes = React.useCallback(() => {
		return getMyAppliedCode().then(d => {
			const codes = d?.data?.applied_codes ?? (d?.data?.applied_code ? [d.data.applied_code] : null) ?? (d?.applied_code ? [d.applied_code] : []);
			setAppliedFriendCodes(codes.map((code, i) => ({ id: `friend-${i}`, code, title: t("account.friendCode"), description: t("account.appliedReferralCodeDesc"), type: "friend", validUntil: "N/A", usedCount: "1", status: "applied", provider: t("account.friendProvider"), earnings: 0 })));
		}).catch(() => {});
	}, [t]);
	useEffect(() => {
		const uid = getUser()?.user_id;
		if (uid) getMe(uid).then(d => {
			const apiUser = Array.isArray(d) ? d[0] : d;
			setLiveUser(prev => ({ ...prev, ...apiUser }));
		}).catch(() => {});
		getReferralEarnings().then(d => setLiveEarnings(d?.data ?? d)).catch(() => {});
		getMyReferralCode().then(d => setRefUsageCount(d?.data?.usage_count ?? d?.usage_count ?? null)).catch(() => {});
		// Fetch all previously applied friend codes so they persist across sessions
		loadAppliedCodes();
	}, [loadAppliedCodes]);

	async function handleApplyCode() {
		if (!addCodeInput.trim()) return;
		setApplyLoading(true);
		setApplyError("");
		setApplySuccess("");
		try {
			// RC3: normalise input — trim whitespace and lowercase before sending
			const appliedCode = addCodeInput.trim().toLowerCase();
			await applyReferralCode(appliedCode);
			setApplySuccess(t("account.codeAppliedSuccess"));
			setAddCodeInput("");
			// RC5/#279: refetch the authoritative list so the canonical code shows immediately
			// (the server may resolve a username → STRUG-… code; optimistic add of the typed
			// value could mismatch what appears on reload).
			await loadAppliedCodes();
			getReferralEarnings().then(d => setLiveEarnings(d?.data ?? d)).catch(() => {});
		} catch (err) {
			// RC4: show a clear message for the "already used" error instead of a generic crash
			const errCode = err?.response?.data?.error ?? err?.response?.data?.code ?? "";
			const errMsg = err?.response?.data?.message ?? "";
			if (errCode === "already_used" || errMsg.toLowerCase().includes("already")) {
				setApplyError(t("account.alreadyAppliedError"));
			} else {
				setApplyError(errMsg || t("account.failedApplyCode"));
			}
		} finally {
			setApplyLoading(false);
		}
	}

	const personalCode = liveUser?.username || liveUser?.ref_code || "—";
	const totalEarnings = liveEarnings?.total !== undefined ? parseFloat(liveEarnings.total) : 0;
	const pendingEarnings = liveEarnings?.pending ?? liveEarnings?.pending_earnings ?? 0;
	const totalReferrals = refUsageCount ?? liveEarnings?.total_referrals ?? 0;
	const thisMonthReferrals = liveEarnings?.this_month_referrals ?? liveEarnings?.monthly_referrals ?? 0;

	const [selectedDefault, setSelectedDefault] = useState(personalCode);

	const stats = [
		{ label: t("account.yourReferralCodeLabel"), value: personalCode, sub: t("account.autoGenerated"), accent: "#2563eb" },
		{ label: t("account.totalEarnings"),      value: `$${totalEarnings.toFixed(2)}`, sub: t("account.pendingEarningsSub", { amount: parseFloat(pendingEarnings).toFixed(2) }), accent: "#059669" },
		{ label: t("account.successfulReferrals"),value: String(totalReferrals), sub: t("account.thisMonthSub", { count: thisMonthReferrals }), accent: "#7c3aed" },
		{ label: t("account.savedCodes"),         value: String(appliedFriendCodes.length || 0), sub: appliedFriendCodes.length === 1 ? t("account.oneFriendCodeApplied") : t("account.fromFriends"), accent: "#d97706" },
	];

	const savedCodes = [
		{ id: "PERSONAL", code: personalCode, title: t("account.yourReferralCodeTitle"), description: t("account.shareDescPersonal"), type: "personal", validUntil: t("account.neverExpires"), usedCount: String(totalReferrals), status: "active", provider: t("account.strugPlatform"), earnings: totalEarnings },
		{ id: "USERNAME", code: (liveUser?.username || ""),             title: t("account.usernameCodeTitle"),       description: t("account.shareDescUsername"), type: "personal", validUntil: t("account.neverExpires"), usedCount: String(totalReferrals), status: "active", provider: t("account.strugPlatform"), earnings: totalEarnings },
		...appliedFriendCodes,
	].filter(c => !searchTerm || c.code.toLowerCase().includes(searchTerm.toLowerCase()) || c.title.toLowerCase().includes(searchTerm.toLowerCase()));

	const recentEarnings = (liveEarnings?.transactions && liveEarnings.transactions.length > 0)
		? liveEarnings.transactions.map((txn, i) => ({
			id: t.id ?? (t.transaction_id ? `E${t.transaction_id}` : `E${i}`),
			code: t.ref_code ?? "—",
			orderAmount: parseFloat(t.order_amount ?? t.amount ?? 0),
			cashback: parseFloat(t.cashback ?? t.earned ?? 0),
			date: t.date ?? (t.created_at ? t.created_at.split("T")[0] : "—"),
			category: t.category ?? "—",
			referredUser: t.referred_user ?? t.user_name ?? "—",
		}))
		: [];

	function copy(code) { navigator.clipboard.writeText(code); setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); }

	const cardClassName = "bg-surface-raised border border-border";
	const card = { borderRadius: 16, padding: "20px 22px" };
	const labelClassName = "text-text-secondary";
	const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em" };
	const inputClassName = "bg-surface-raised border border-border text-text-primary";
	const inputStyle = { width: "100%", borderRadius: 10, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

	if (loading) return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflowY: "auto" }}>
			<div style={{ paddingTop: 32 }}>
				<SkeletonHeading /><div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 14, marginTop: 28 }}>{[...Array(4)].map((_,i) => <Skel key={i} h={90} r={14} />)}</div>
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 14, marginTop: 28 }}>{[...Array(4)].map((_,i) => <Skel key={i} h={200} r={14} />)}</div>
			</div>
		</div>
	);

	return (<>
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflowY: "auto" }}>
			<div style={{ paddingTop: 32, paddingBottom: 24 }}>
				{/* Hero */}
				<div style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.25) 0%, rgba(37,99,235,0.08) 60%, var(--color-surface-raised) 100%)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 20, padding: "28px 32px", marginBottom: 28, position: "relative", overflow: "hidden", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
					<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
						<div>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,3vw,38px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.referralSystem")}</h1>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{t("account.referralHeroDesc")}</p>
						</div>
						<div style={{ display: "flex", gap: 10 }}>
							{appliedFriendCodes.length === 0 && (
							<button onClick={() => addCodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 10, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t("account.addFriendCode")}
							</button>
							)}
							<button className="text-text-primary bg-surface-raised border border-border" onClick={() => setShowQrModal(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18M3 15h18M15 3v18"/></svg>{t("account.generateQr")}
							</button>
						</div>
					</div>
				</div>

				{/* Stats */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 14, marginBottom: 24, animation: "fadeUp 0.3s ease 60ms both" }}>
					{stats.map((s, i) => (
						<div className={cardClassName} key={i} style={{ ...card, borderLeft: `3px solid ${s.accent}` }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 4 }}>{s.value}</p>
							<p className={labelClassName} style={{ ...label, marginBottom: 4 }}>{s.label}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: s.accent }}>{s.sub}</p>
						</div>
					))}
				</div>

				{/* How it works */}
				<div className={cardClassName} style={{ ...card, marginBottom: 24, animation: "fadeUp 0.3s ease 90ms both" }}>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 18 }}>{t("account.howReferralsWork")}</p>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 20 }}>
						{[
							{ step: t("account.step1Share"), desc: t("account.step1ShareDesc", { personalCode, username: liveUser?.username || "" }), color: "#2563eb" },
							{ step: t("account.step2FriendsUse"), desc: t("account.step2FriendsUseDesc"), color: "#059669" },
							{ step: t("account.step3EarnCashback"), desc: t("account.step3EarnCashbackDesc"), color: "#d97706" },
						].map((item, i) => (
							<div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
								<div style={{ width: 32, height: 32, borderRadius: 9, background: `${item.color}22`, border: `1px solid ${item.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
								</div>
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{item.step}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>{item.desc}</p>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Default code selector */}
				<div className={cardClassName} style={{ ...card, marginBottom: 24, animation: "fadeUp 0.3s ease 110ms both" }}>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.defaultReferralCode")}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{t("account.selectDefaultCodeDesc")}</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{[{ code: personalCode, title: t("account.yourReferralCodeTitle") }, { code: (liveUser?.username || ""), title: t("account.usernameCodeTitle") }].map(item => {
							const isDefault = selectedDefault === item.code;
							return (
								<div key={item.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: isDefault ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${isDefault ? "rgba(37,99,235,0.35)" : "var(--color-border)"}`, borderRadius: 10 }}>
									<div>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{item.code}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{item.title}</p>
									</div>
									<button onClick={() => setSelectedDefault(item.code)} style={{ padding: "7px 14px", background: isDefault ? "rgba(37,99,235,0.25)" : "var(--color-surface-raised)", border: `1px solid ${isDefault ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`, borderRadius: 8, color: isDefault ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
										{isDefault ? t("account.defaultLabel") : t("account.setDefault")}
									</button>
								</div>
							);
						})}
					</div>
				</div>

				{/* Recent Earnings */}
				<div className={cardClassName} style={{ ...card, marginBottom: 24, animation: "fadeUp 0.3s ease 130ms both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase" }}>{t("account.recentEarnings")}</p>
						<button style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}>{t("account.viewAll")}</button>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{recentEarnings.length === 0 && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{t("account.noEarningsYet")}</p>
						)}
						{recentEarnings.map(e => (
							<div className="bg-surface-raised border border-border-subtle" key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
									<div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(5,150,105,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
									</div>
									<div>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{t("account.cashbackEarned", { amount: e.cashback.toFixed(2) })}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t("account.earningFromUser", { user: e.referredUser, category: e.category, amount: e.orderAmount })}</p>
									</div>
								</div>
								<div style={{ textAlign: "right" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>{e.date}</p>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>{e.category}</span>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Search + code grid */}
				<div style={{ marginBottom: 24, animation: "fadeUp 0.3s ease 150ms both" }}>
					<div style={{ position: "relative", marginBottom: 16 }}>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
						<input className={inputClassName} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} aria-label={i18n.t("account.searchRefCodes")} placeholder={i18n.t("account.searchRefCodes")} style={{ ...inputStyle, paddingLeft: 38 }} />
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
						{savedCodes.map(rc => {
							const isDefault = selectedDefault === rc.code;
							return (
								<div className={cardClassName} key={rc.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
									<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
										<div>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{rc.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{rc.provider}</p>
										</div>
										<div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.3)", color: "#34d399" }}>{t("account.activeStatus")}</span>
											{isDefault && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.4)", color: "#60a5fa" }}>{t("account.defaultLabel")}</span>}
										</div>
									</div>
									{/* Code display */}
									<div className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
										<div>
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginBottom: 3 }}>{t("account.codeLabel")}</p>
											<p className="text-text-primary" style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>{rc.code}</p>
										</div>
										<button className="bg-surface-raised border border-border" onClick={() => copy(rc.code)} style={{ width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: copiedCode === rc.code ? "#34d399" : "var(--color-text-secondary)" }}>
											{copiedCode === rc.code
												? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
												: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
										</button>
									</div>
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										<div style={{ display: "flex", justifyContent: "space-between" }}><span className={labelClassName} style={{ ...label }}>{t("account.benefitLabel")}</span><span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{t("account.percentageCashback")}</span></div>
										{rc.type === "personal" && <div style={{ display: "flex", justifyContent: "space-between" }}><span className={labelClassName} style={{ ...label }}>{t("account.yourEarningsLabel")}</span><span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>${rc.earnings.toFixed(2)}</span></div>}
										<div style={{ display: "flex", justifyContent: "space-between" }}><span className={labelClassName} style={{ ...label }}>{t("account.timesUsed")}</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{rc.usedCount}</span></div>
										<div style={{ display: "flex", justifyContent: "space-between" }}><span className={labelClassName} style={{ ...label }}>{t("account.validUntil")}</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{rc.validUntil}</span></div>
									</div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>{rc.description}</p>
									<div style={{ display: "flex", gap: 8 }}>
										<button onClick={() => setSelectedDefault(rc.code)} style={{ flex: 1, padding: "9px 0", background: isDefault ? "rgba(37,99,235,0.25)" : "rgba(37,99,235,0.12)", border: `1px solid rgba(37,99,235,${isDefault ? "0.5" : "0.3"})`, borderRadius: 9, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
											{isDefault ? t("account.defaultLabel") : t("account.setDefault")}
										</button>
										<button onClick={() => {
											// RC2: share referral code — use Web Share API if available, else clipboard copy
											if (navigator.share) {
												navigator.share({ title: t("account.shareTitleReferral"), text: t("account.shareTextReferral", { code: rc.code }), url: `https://strug.ca?ref=${rc.code}` }).catch(() => {});
											} else {
												navigator.clipboard.writeText(rc.code).then(() => { setCopiedCode(rc.code); setTimeout(() => setCopiedCode(null), 2000); }).catch(() => {});
											}
										}} style={{ width: 38, height: 38, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Add friend code — locked once a recruiter (first-touch creator) is set */}
				<div className={cardClassName} ref={addCodeRef} style={{ ...card, textAlign: "center", animation: "fadeUp 0.3s ease 170ms both" }}>
					<div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
						<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
					</div>
					{appliedFriendCodes.length > 0 ? (
						<>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.recruiterLockedTitle")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 8 }}>{t("account.recruiterLockedDesc")}</p>
						</>
					) : (
						<>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.addFriendsReferralCode")}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{t("account.addFriendsReferralCodeDesc")}</p>
					<div style={{ display: "flex", gap: 10, maxWidth: 420, margin: "0 auto" }}>
						<input className={inputClassName} value={addCodeInput} onChange={e => { setAddCodeInput(e.target.value); setApplyError(""); setApplySuccess(""); }} aria-label={t("account.friendCodePlaceholder")} placeholder={t("account.friendCodePlaceholder")} style={{ ...inputStyle, flex: 1 }} />
						<button onClick={handleApplyCode} disabled={applyLoading || !addCodeInput.trim()} style={{ color: "#fff", padding: "0 20px", background: applyLoading ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: applyLoading ? "default" : "pointer", whiteSpace: "nowrap", opacity: !addCodeInput.trim() ? 0.5 : 1 }}>{applyLoading ? t("account.applying") : t("account.addCode")}</button>
					</div>
					{applySuccess && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#34d399", marginTop: 10 }}>{applySuccess}</p>}
					{applyError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginTop: 10 }}>{applyError}</p>}
						</>
					)}
				</div>
			</div>
		</div>
		{showQrModal && <QrModal personalCode={personalCode} onClose={() => setShowQrModal(false)} />}
		</>
	);
}

// #280 consolidated earnings — one earnings SOURCE per scoped analytics endpoint (calling
// per-source, not per-portal, avoids double-counting since e.g. all food sub-portals share
// getFoodVendorAnalytics). Each endpoint returns { data: { summary:{gross,net,count},
// timeseries:[{date,net,...}] } } scoped to the caller. getEmployerJobAnalytics is a SPEND
// view (hirer) so it is deliberately excluded.
const EARNINGS_SOURCES = [
  { key: "shop",      label: "Shop & Products", color: "#2563eb", portals: ["sd-ecommerce", "sd-usedproducts", "sd-digproducts", "sd-listdiscounts", "sd-authors", "sd-decor"], fetch: getSellerProductAnalytics },
  { key: "food",      label: "Food & Grocery",  color: "#f59e0b", portals: ["sd-food", "sd-groceries", "sd-flowers", "sd-catering", "sd-mealkit"], fetch: getFoodVendorAnalytics },
  { key: "services",  label: "Services",        color: "#06b6d4", portals: ["sd-services", "sd-proservices", "sd-automotive"], fetch: getServiceProviderAnalytics },
  { key: "bookings",  label: "Bookings",        color: "#8b5cf6", portals: ["sd-restbookings", "sd-doctors", "sd-wedding", "sd-decor"], fetch: getBookingHostAnalytics() },
  { key: "creator",   label: "Creator",         color: "#ef4444", portals: ["sd-creator"], fetch: getCreatorEarnings },
  { key: "streaming", label: "Live Streaming",  color: "#ec4899", portals: ["sd-streamer"], fetch: getStreamerLiveAnalytics },
  { key: "rideshare", label: "Rideshare",       color: "#10b981", portals: ["sd-drive"], fetch: getDriverAnalytics },
  { key: "courier",   label: "Courier",         color: "#22d3ee", portals: ["sd-courier"], fetch: getCourierAnalytics },
  { key: "work",      label: "Work & Gigs",     color: "#a3e635", portals: ["sd-freelancer", "sd-instructor"], fetch: getWorkerAnalytics },
];

function ConsolidatedEarnings({ isMobile }) {
  const [range, setRange] = useState("28d");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSellerPortalStatus()
      .then((res) => {
        const statuses = res?.data?.statuses ?? res?.statuses ?? {};
        const active = EARNINGS_SOURCES.filter((s) => s.portals.some((p) => statuses[p]));
        if (active.length === 0) { if (alive) { setRows([]); setLoading(false); } return; }
        return Promise.all(active.map((s) =>
          s.fetch(range)
            .then((r) => { const d = r?.data ?? r ?? {}; return { ...s, net: Number(d?.summary?.net) || 0, gross: Number(d?.summary?.gross) || 0, count: Number(d?.summary?.count) || 0, timeseries: Array.isArray(d?.timeseries) ? d.timeseries : [] }; })
            .catch(() => ({ ...s, net: 0, gross: 0, count: 0, timeseries: [] }))
        )).then((results) => { if (alive) { setRows(results); setLoading(false); } });
      })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, [range]);

  const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const platformFees = Math.max(0, totalGross - totalNet);
  const earners = rows.filter((r) => r.net > 0 || r.gross > 0).sort((a, b) => b.net - a.net);
  const top = earners[0];
  const trendMap = new Map();
  rows.forEach((r) => r.timeseries.forEach((p) => { if (p?.date != null) trendMap.set(p.date, (trendMap.get(p.date) || 0) + (Number(p.net) || 0)); }));
  const trend = [...trendMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, net]) => ({ date, earnings: net }));
  const maxNet = earners.length ? earners[0].net : 0;

  const label = (txt) => <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 14px" }}>{txt}</p>;
  const kpi = (l, v, accent, extra) => (
    <div className="bg-surface-raised border border-border-subtle" style={{ flex: "1 1 150px", minWidth: 140, borderRadius: 12, padding: "14px 16px" }}>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{l}</p>
      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: accent || "var(--color-text-primary)" }}>{v}</p>
      {extra && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }}>{extra}</p>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          {label("Earnings across all your work")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setRange(opt.id)} style={{ padding: "5px 11px", borderRadius: 16, border: `1px solid ${range === opt.id ? "#2563eb" : "var(--color-border)"}`, background: range === opt.id ? "#2563eb22" : "transparent", color: range === opt.id ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{opt.label}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{[...Array(4)].map((_, i) => <Skel key={i} w={160} h={86} r={12} />)}</div>
        ) : earners.length === 0 ? (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No earnings yet for this period. Once you earn from selling, driving, or hosting, it'll show up here.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              {kpi("Net earnings", money(totalNet), "#4ade80", totalGross > 0 ? `${Math.round((totalNet / totalGross) * 100)}% kept after fees` : "After platform fees")}
              {kpi("Gross", money(totalGross), "var(--color-text-primary)")}
              {kpi("Platform fees", money(platformFees), "#f59e0b")}
              {kpi("Active sources", String(earners.length), "#60a5fa", top ? `Top: ${top.label}` : undefined)}
            </div>
            <div className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Earnings trend</p>
              <TrendChart data={trend} metric="earnings" color="#4ade80" height={isMobile ? 160 : 210} formatValue={money} />
            </div>
            <div>
              {label("Earnings by source")}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {earners.map((r) => (
                  <div className="bg-surface-raised border border-border-subtle" key={r.key} style={{ borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                        <div>
                          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{r.label}</p>
                          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{r.count} order{r.count === 1 ? "" : "s"} · gross {money(r.gross)}{r.count > 0 ? ` · ${money(r.net / r.count)}/order` : ""}{totalNet > 0 ? ` · ${Math.round((r.net / totalNet) * 100)}% of net` : ""}</p>
                        </div>
                      </div>
                      <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{money(r.net)}</p>
                    </div>
                    <div className="bg-surface-raised" style={{ width: "100%", height: 6, borderRadius: 3 }}>
                      <div style={{ width: `${maxNet > 0 ? Math.max(3, (r.net / maxNet) * 100) : 0}%`, height: "100%", background: r.color, borderRadius: 3, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WalletEarningsPage() {
	const { t } = useTranslation();
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad();
	const uid = useId(); // unique prefix for wallet form label/field associations
	const [activeTab, setActiveTab] = useState("overview");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [addFundsAmount, setAddFundsAmount] = useState("");
	const [transferAmount, setTransferAmount] = useState("");
	const [liveWallet, setLiveWallet] = useState(null);
	const [realBalance, setRealBalance] = useState(null);
	const [refRange, setRefRange] = useState("28d");
	const [refAnalytics, setRefAnalytics] = useState(null);
	useEffect(() => {
		getReferralEarnings().then(d => setLiveWallet(d?.data ?? null)).catch(() => {});
		getWalletBalance().then(d => setRealBalance(d?.balance != null ? parseFloat(d.balance) : 0)).catch(() => {});
	}, []);
	useEffect(() => {
		getReferralAnalytics(refRange).then(d => setRefAnalytics(d?.data ?? d ?? null)).catch(() => {});
	}, [refRange]);
	const refSummary = refAnalytics?.summary ?? {};
	const refSeries = (refAnalytics?.timeseries ?? []).map(p => ({ date: p.date, earnings: p.net ?? 0 }));

	const walletTotal = realBalance != null ? `$${realBalance.toFixed(2)}` : "$0.00";
	const recruitEngine = liveWallet?.engines?.recruit;
	const friendEngine = liveWallet?.engines?.referral;
	const recruitTotalNum = parseFloat(recruitEngine?.total ?? liveWallet?.total ?? 0) || 0;
	const friendTotalNum = parseFloat(friendEngine?.total ?? 0) || 0;
	const recruitTotal = `$${recruitTotalNum.toFixed(2)}`;
	const friendReferralTotal = `$${friendTotalNum.toFixed(2)}`;
	const walletStats = [
		{ label: t("account.walletBalance"), value: walletTotal, sub: t("account.walletBalanceSub"), accent: "#059669" },
		{ label: t("account.referralCashback"), value: recruitTotal, sub: t("account.referralCashbackSub"), accent: "#2563eb" },
		{ label: t("account.friendReferralEarnings", { defaultValue: "Friend Referral" }), value: friendReferralTotal, sub: t("account.friendReferralEarningsSub", { defaultValue: "From friend codes on checkout" }), accent: "#0891b2" },
		{ label: t("account.pendingCashback"), value: `$${(Number(refSummary.pending_total) || 0).toFixed(2)}`, sub: t("account.pendingCashbackSub"), accent: "#d97706" },
	];

	const mapWalletTxn = (row, i, engine) => {
		const amt = Number(row.amount ?? 0);
		const isCredit = amt >= 0;
		const dateStr = row.created_at ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
		const timeStr = row.created_at ? new Date(row.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
		const fallbackDesc = engine === "referral"
			? t("account.friendReferralTxn", { defaultValue: "Friend referral reward" })
			: t("account.referralCashbackTxn");
		return {
			id: row.transaction_id ? `TXN-${String(row.transaction_id).padStart(3, "0")}` : `TXN-${engine}-${i + 1}`,
			type: isCredit ? "credit" : "debit",
			desc: row.description || fallbackDesc,
			engine,
			engineLabel: engine === "referral"
				? t("account.engineFriendReferral", { defaultValue: "Friend Referral" })
				: t("account.engineRecruit", { defaultValue: "Affiliate" }),
			amount: isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`,
			date: dateStr,
			time: timeStr,
			createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
			status: "completed",
			code: row.ref_code ?? undefined,
			orderAmt: row.order_amount ?? undefined,
		};
	};

	const recruitTxRows = recruitEngine?.transactions ?? liveWallet?.transactions ?? [];
	const friendTxRows = friendEngine?.transactions ?? [];
	const transactions = [
		...recruitTxRows.map((row, i) => mapWalletTxn(row, i, "recruit")),
		...friendTxRows.map((row, i) => mapWalletTxn(row, i, "referral")),
	].sort((a, b) => b.createdAt - a.createdAt);

	// #281: Invite & Earn cleared vs pending, plus Recruit vs Friend Referral program split.
	const earningsSources = (() => {
		const cleared = Number(refSummary.cleared_total) || 0;
		const pending = Number(refSummary.pending_total) || 0;
		const statusTotal = cleared + pending;
		const statusRows = statusTotal <= 0 ? [] : [
			{ source: t("account.clearedEarnings", { defaultValue: "Cleared" }), amount: `$${cleared.toFixed(2)}`, pct: Math.round((cleared / statusTotal) * 100), color: "#059669" },
			{ source: t("account.pendingEarnings", { defaultValue: "Pending" }), amount: `$${pending.toFixed(2)}`, pct: Math.round((pending / statusTotal) * 100), color: "#d97706" },
		];
		const engineTotal = recruitTotalNum + friendTotalNum;
		const engineRows = engineTotal <= 0 ? [] : [
			{ source: t("account.engineRecruit", { defaultValue: "Affiliate" }), amount: `$${recruitTotalNum.toFixed(2)}`, pct: Math.round((recruitTotalNum / engineTotal) * 100), color: "#2563eb" },
			{ source: t("account.engineFriendReferral", { defaultValue: "Friend Referral" }), amount: `$${friendTotalNum.toFixed(2)}`, pct: Math.round((friendTotalNum / engineTotal) * 100), color: "#0891b2" },
		];
		return { statusRows, engineRows };
	})();

	const stripe = useStripe();
	const elements = useElements();
	const [paymentMethods, setPaymentMethods] = useState([]);
	const [showAddPayment, setShowAddPayment] = useState(false);
	const [addPaymentLoading, setAddPaymentLoading] = useState(false);
	const [addPaymentError, setAddPaymentError] = useState("");
	const [addPaymentDone, setAddPaymentDone] = useState(false);
	useEffect(() => {
		getPaymentMethods().then(data => { if (Array.isArray(data)) setPaymentMethods(data.map(m => ({ id: m.id, name: `${m.brand?.toUpperCase() ?? "Card"} ····${m.last4}  ${m.exp_month}/${m.exp_year}` }))); }).catch(() => {});
	}, []);
	async function handleAddPaymentMethod() {
		if (!stripe || !elements) return;
		setAddPaymentLoading(true);
		setAddPaymentError("");
		try {
			const { clientSecret } = await createSetupIntent();
			const result = await stripe.confirmCardSetup(clientSecret, { payment_method: { card: elements.getElement(CardElement) } });
			if (result.error) { setAddPaymentError(result.error.message ?? t("account.cardSetupFailed")); return; }
			setAddPaymentDone(true);
			getPaymentMethods().then(data => { if (Array.isArray(data)) setPaymentMethods(data.map(m => ({ id: m.id, name: `${m.brand?.toUpperCase() ?? "Card"} ····${m.last4}  ${m.exp_month}/${m.exp_year}` }))); }).catch(() => {});
			setTimeout(() => { setShowAddPayment(false); setAddPaymentDone(false); }, 2000);
		} catch (e) { setAddPaymentError(e?.response?.data?.error ?? e?.message ?? t("account.failedSetupCard")); }
		finally { setAddPaymentLoading(false); }
	}

	const TABS = [
		{ id: "overview",     label: t("account.overview") },
		{ id: "allearnings",  label: t("account.earningsTab", { defaultValue: "Earnings" }) },
		{ id: "transactions", label: t("account.transactions") },
		{ id: "earnings",     label: t("account.referralEarningsTab") },
		{ id: "manage",       label: t("account.manageWallet") },
	];

	const cardClassName = "bg-surface-raised border border-border";
	const card = { borderRadius: 14, padding: "18px 20px" };
	const inpClassName = "bg-surface-raised border border-border text-text-primary";
	const inp = { width: "100%", borderRadius: 10, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

	if (loading) return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflowY: "auto" }}>
			<div style={{ paddingTop: 32 }}>
				<SkeletonHeading />
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 14, marginTop: 28 }}>{[...Array(4)].map((_,i) => <Skel key={i} h={90} r={14} />)}</div>
				<Skel h={320} r={14} style={{ marginTop: 24 }} />
			</div>
		</div>
	);

	const TxnIcon = ({ type }) => (
		<div style={{ width: 34, height: 34, borderRadius: 9, background: type === "credit" ? "rgba(5,150,105,0.15)" : "rgba(220,38,38,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
			{type === "credit"
				? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
				: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>}
		</div>
	);

	return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflowY: "auto" }}>
			<div style={{ paddingTop: 32, paddingBottom: 24 }}>
				{/* Hero */}
				<div style={{ background: "linear-gradient(135deg, rgba(5,150,105,0.22) 0%, rgba(37,99,235,0.1) 60%, var(--color-surface-raised) 100%)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 20, padding: "28px 32px", marginBottom: 28, position: "relative", overflow: "hidden", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(5,150,105,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
					<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
						<div>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,3vw,38px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.walletEarnings")}</h1>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{t("account.walletHeroDesc")}</p>
						</div>
						<div style={{ display: "flex", gap: 10 }}>
						</div>
					</div>
				</div>

				{/* Stats */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 14, marginBottom: 24, animation: "fadeUp 0.3s ease 60ms both" }}>
					{walletStats.map((s, i) => (
						<div className={cardClassName} key={i} style={{ ...card, borderLeft: `3px solid ${s.accent}` }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 4 }}>{s.value}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: s.accent }}>{s.sub}</p>
						</div>
					))}
				</div>

				{/* Tabs */}
				<div className={cardClassName} style={{ ...card, padding: 0, overflow: "hidden", animation: "fadeUp 0.3s ease 90ms both" }}>
					<div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", overflowX: "auto", scrollbarWidth: "none" }}>
						{TABS.map(tab => (
							<button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flexShrink: 0, padding: "14px 24px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", color: activeTab === tab.id ? "#60a5fa" : "var(--color-text-secondary)", borderBottom: `2px solid ${activeTab === tab.id ? "#2563eb" : "transparent"}`, transition: "color 0.2s, border-color 0.2s" }}>
								{tab.label}
							</button>
						))}
					</div>
					<div style={{ padding: "24px 22px" }}>
						{activeTab === "overview" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
								{/* Quick Actions */}
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.quickActions")}</p>
									<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 12 }}>
										{[
											{ label: t("account.referFriends"), sub: t("account.referFriendsSub"),   color: "#7c3aed" },
										].map((a, i) => (
											<button className="bg-surface-raised border border-border" key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left" }}>
												<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
													<div style={{ width: 34, height: 34, borderRadius: 9, background: `${a.color}1a`, display: "flex", alignItems: "center", justifyContent: "center" }}>
														<div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} />
													</div>
													<div>
														<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{a.label}</p>
														<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{a.sub}</p>
													</div>
												</div>
												<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
											</button>
										))}
									</div>
								</div>
								{/* Recent Transactions */}
								<div>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("account.recentTransactions")}</p>
										<button style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", background: "none", border: "none", cursor: "pointer", padding: "6px 8px", margin: "-6px -8px" }}>{t("account.viewAll")}</button>
									</div>
									<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
										{transactions.length === 0 && (
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "16px 0" }}>{t("account.noTransactionsYet")}</p>
										)}
										{transactions.slice(0, 3).map((txn, i) => (
											<div className="bg-surface-raised border border-border-subtle" key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10 }}>
												<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
													<TxnIcon type={txn.type} />
													<div>
														<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{txn.desc}</p>
														<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{txn.engineLabel} · {txn.date} at {txn.time}</p>
													</div>
												</div>
												<div style={{ textAlign: "right" }}>
													<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: txn.type === "credit" ? "#34d399" : "#f87171", marginBottom: 4 }}>{txn.amount}</p>
													<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(5,150,105,0.15)", color: "#34d399" }}>{t("account.completedStatus")}</span>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{activeTab === "transactions" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
								<div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
									<div style={{ display: "flex", gap: 10 }}>
										<select className="text-text-primary bg-surface-raised border border-border" style={{ padding: "8px 12px", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}><option>{t("account.allTypes")}</option><option>{t("account.credits")}</option><option>{t("account.debits")}</option></select>
										<select className="text-text-primary bg-surface-raised border border-border" style={{ padding: "8px 12px", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}><option>{t("account.allTime")}</option><option>{t("account.today")}</option><option>{t("account.thisWeek")}</option><option>{t("account.thisMonth")}</option></select>
									</div>
									<button className="text-text-secondary bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>{t("account.export")}
									</button>
								</div>
								<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
									{transactions.length === 0 && (
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 0" }}>{t("account.noTransactionsYet")}</p>
									)}
									{transactions.map((txn, i) => (
										<div className="bg-surface-raised border border-border-subtle" key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10 }}>
											<div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
												<TxnIcon type={txn.type} />
												<div>
													<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{txn.desc}</p>
													{txn.code && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#60a5fa", marginBottom: 2 }}>{t("account.txnCodeLine", { code: txn.code, amount: txn.orderAmt })}</p>}
													<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{txn.engineLabel} · ID: {txn.id} · {txn.date} at {txn.time}</p>
												</div>
											</div>
											<div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: txn.type === "credit" ? "#34d399" : "#f87171", marginBottom: 4 }}>{txn.amount}</p>
												<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(5,150,105,0.15)", color: "#34d399" }}>{t("account.completedStatus")}</span>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{activeTab === "allearnings" && (
							<ConsolidatedEarnings isMobile={isMobile} />
						)}

						{activeTab === "earnings" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
								{/* #281 referral tracker: lifetime + this-period totals, range toggle, trend graph. */}
								<div>
									<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{t("account.referralPerformance")}</p>
										<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
											{RANGE_OPTIONS.map(opt => (
												<button key={opt.id} onClick={() => setRefRange(opt.id)} style={{ padding: "5px 11px", borderRadius: 16, border: `1px solid ${refRange === opt.id ? "#2563eb" : "var(--color-border)"}`, background: refRange === opt.id ? "#2563eb22" : "transparent", color: refRange === opt.id ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{opt.label}</button>
											))}
										</div>
									</div>
									<div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
										{[
											{ label: t("account.lifetimeReferralEarnings"), value: `$${(refSummary.lifetime_total ?? 0).toFixed(2)}`, accent: "#2563eb" },
											{ label: t("account.thisPeriod"), value: `$${(refSummary.period_total ?? 0).toFixed(2)}`, accent: "#059669", delta: refSummary.period_change_pct },
											{ label: t("account.friendReferralEarnings", { defaultValue: "Friend Referral" }), value: friendReferralTotal, accent: "#0891b2" },
											{ label: t("account.pendingCashback"), value: `$${(refSummary.pending_total ?? 0).toFixed(2)}`, accent: "#d97706" },
											{ label: t("account.referredUsers"), value: String(refSummary.referred_users ?? 0), accent: "#7c3aed" },
										].map((s, i) => (
											<div className="bg-surface-raised border border-border-subtle" key={i} style={{ flex: "1 1 140px", minWidth: 130, borderRadius: 12, padding: "14px 16px" }}>
												<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</p>
												<div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
													<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22 }}>{s.value}</p>
													{s.delta != null && !Number.isNaN(s.delta) && (
														<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: s.delta >= 0 ? "#4ade80" : "#ef4444" }}>{s.delta >= 0 ? "+" : ""}{s.delta.toFixed(1)}%</span>
													)}
												</div>
											</div>
										))}
									</div>
									<div className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "16px 18px" }}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{t("account.referralEarningsTrend")}</p>
										<TrendChart data={refSeries} metric="earnings" color="#2563eb" height={isMobile ? 160 : 200} formatValue={v => `$${Number(v).toFixed(2)}`} />
									</div>
								</div>
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.enginesEarningsBreakdown", { defaultValue: "Earnings by program" })}</p>
									{earningsSources.engineRows.length === 0
										? <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 8 }}>{t("account.noEarningsYet")}</p>
										: <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
											{earningsSources.engineRows.map((s, i) => (
												<div className="bg-surface-raised border border-border-subtle" key={`engine-${i}`} style={{ borderRadius: 10, padding: "14px 16px" }}>
													<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
														<div>
															<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{s.source}</p>
															<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t("account.pctOfTotal", { pct: s.pct })}</p>
														</div>
														<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{s.amount}</p>
													</div>
													<div className="bg-surface-raised" style={{ width: "100%", height: 6, borderRadius: 3 }}>
														<div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 3, transition: "width 0.5s ease" }} />
													</div>
												</div>
											))}
										</div>
									}
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.referralEarningsBreakdown")}</p>
									{earningsSources.statusRows.length === 0
										? <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 8 }}>{t("account.noEarningsYet")}</p>
										: <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
											{earningsSources.statusRows.map((s, i) => (
												<div className="bg-surface-raised border border-border-subtle" key={`status-${i}`} style={{ borderRadius: 10, padding: "14px 16px" }}>
													<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
														<div>
															<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{s.source}</p>
															<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t("account.pctOfTotal", { pct: s.pct })}</p>
														</div>
														<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{s.amount}</p>
													</div>
													<div className="bg-surface-raised" style={{ width: "100%", height: 6, borderRadius: 3 }}>
														<div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 3, transition: "width 0.5s ease" }} />
													</div>
												</div>
											))}
										</div>
									}
								</div>
							</div>
						)}

						{activeTab === "manage" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
								{/* Payment methods */}
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.paymentMethods")}</p>
									<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
										{paymentMethods.length === 0 ? (
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "8px 0" }}>{t("account.noPaymentMethodsAdded")}</p>
										) : paymentMethods.map(m => (
											<div className="bg-surface-raised border border-border" key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10 }}>
												<div>
													<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: m.isDefault ? 4 : 0 }}>{m.name}</p>
													{m.isDefault && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(37,99,235,0.2)", color: "#60a5fa" }}>{t("account.defaultLabel")}</span>}
												</div>
												<button className="text-text-secondary bg-surface-raised border border-border" style={{ padding: "7px 14px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{t("account.edit")}</button>
											</div>
										))}
										<button className="text-text-secondary bg-surface-raised" onClick={() => { setShowAddPayment(true); setAddPaymentError(""); setAddPaymentDone(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: "1px dashed var(--color-border)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t("account.addPaymentMethod")}
										</button>
										{showAddPayment && (
											// Backdrop scrim stays a fixed black overlay in both themes (modal-dimming convention).
											<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) setShowAddPayment(false); }}>
												<div className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: 28, width: 400, maxWidth: "90vw" }}>
													<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, textTransform: "uppercase", marginBottom: 20 }}>{t("account.addPaymentMethod")}</p>
													{addPaymentDone ? (
														<p style={{ color: "#34d399", fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center" }}>✓ {t("account.cardSavedSuccess")}</p>
													) : (
														<>
															{/* Kept permanently dark, like the CardElement box in Rideshare.jsx: Stripe's iframe
															    reads its text color from this JS options object, which can't resolve
															    var(--color-*) custom properties, so box + white text must stay a fixed
															    matched pair regardless of theme. */}
															<div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", padding: "12px 14px", borderRadius: 10, marginBottom: 16 }}>
																<CardElement options={{ style: { base: { color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", "::placeholder": { color: "rgba(255,255,255,0.35)" } } } }} />
															</div>
															{addPaymentError && <p style={{ color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{addPaymentError}</p>}
															<div style={{ display: "flex", gap: 10 }}>
																<button className="text-text-secondary bg-surface-raised border border-border" onClick={() => setShowAddPayment(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>{t("common.cancel")}</button>
																<button onClick={handleAddPaymentMethod} disabled={addPaymentLoading} style={{ color: "#fff", flex: 1, padding: "11px", background: "#2563eb", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: addPaymentLoading ? "default" : "pointer", opacity: addPaymentLoading ? 0.7 : 1 }}>{addPaymentLoading ? t("account.savingCard") : t("account.saveCard")}</button>
															</div>
														</>
													)}
												</div>
											</div>
										)}
									</div>
								</div>
								{/* Withdraw */}
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.withdrawWalletFunds")}</p>
									<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "20px" }}>
										<label className="text-text-secondary" htmlFor={`${uid}-withdraw-amt`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.amountToWithdraw")}</label>
										<input className={inpClassName} id={`${uid}-withdraw-amt`} type="number" placeholder="0.00" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={{ ...inp, marginBottom: 6 }} />
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 14 }}>{t("account.availableWalletBalance", { balance: walletTotal })}</p>
										<label className="text-text-secondary" htmlFor={`${uid}-withdraw-to`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.withdrawTo")}</label>
										<select className={inpClassName} id={`${uid}-withdraw-to`} style={{ ...inp, marginBottom: 16 }}>
											{paymentMethods.length === 0 ? <option disabled>{t("account.noPaymentMethods")}</option> : paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}{m.isDefault ? t("account.defaultInParens") : ""}</option>)}
										</select>
										<button className="text-text-muted bg-surface-raised border border-border" disabled style={{ width: "100%", padding: "12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "not-allowed" }}>{t("account.withdrawFundsComingSoon")}</button>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", marginTop: 8 }}>{t("account.withdrawalsComingSoonHint")}</p>
									</div>
								</div>
								{/* Add Funds */}
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("account.addFundsToWallet")}</p>
									<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "20px" }}>
										<label className="text-text-secondary" htmlFor={`${uid}-add-amt`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.amountToAdd")}</label>
										<input className={inpClassName} id={`${uid}-add-amt`} type="number" placeholder="0.00" value={addFundsAmount} onChange={e => setAddFundsAmount(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
										<label className="text-text-secondary" htmlFor={`${uid}-add-method`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.walletPaymentMethod")}</label>
										<select className={inpClassName} id={`${uid}-add-method`} style={{ ...inp, marginBottom: 16 }}>
											{paymentMethods.length === 0 ? <option disabled>{t("account.noPaymentMethods")}</option> : paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
										</select>
										<button className="text-text-muted bg-surface-raised border border-border" disabled style={{ width: "100%", padding: "12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "not-allowed" }}>{t("account.addFundsComingSoon")}</button>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", marginTop: 8 }}>{t("account.fundTopUpsComingSoon")}</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Personal analytics dashboard ────────────────────────────────────────────
// Redone (was a home-style "choose a service" launcher) to mirror the analytics
// surfaces elsewhere in the app: range selector → KPI cards → trend chart →
// category donut + recently-watched → recent activity. Everything the member has
// done on Strug in one view. No provider-hub / become-a-seller entries here —
// those live in the dedicated Provider Hub.

const DASH_CAT = {
	product:    { label: "Shop",      color: "#2563eb" },
	food:       { label: "Food",      color: "#f59e0b" },
	rideshare:  { label: "Rides",     color: "#10b981" },
	service:    { label: "Services",  color: "#06b6d4" },
	rental:     { label: "Rentals",   color: "#8b5cf6" },
	viewing:    { label: "Viewings",  color: "#ec4899" },
	test_drive: { label: "Test drives", color: "#a3e635" },
	mechanic:   { label: "Mechanic",  color: "#f87171" },
};

const RANGE_DAYS = { "7d": 7, "28d": 28, "90d": 90, "365d": 365, lifetime: null };

function dashDayKey(d) {
	const dt = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(dt.getTime())) return null;
	return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function dashParseAmount(...vals) {
	for (const v of vals) {
		if (v == null) continue;
		const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
		if (Number.isFinite(n)) return n;
	}
	return 0;
}
function dashArr(res) {
	const v = res?.status === "fulfilled" ? res.value : res;
	if (Array.isArray(v)) return v;
	if (Array.isArray(v?.data)) return v.data;
	if (Array.isArray(v?.data?.data)) return v.data.data;
	return [];
}

// Flatten every buyer-side order source into one { kind, title, seller, amount, status, date } shape.
function normalizeDashActivity([products, food, rides, services, rentals, appointments, testDrives, mechanic]) {
	const out = [];
	for (const o of dashArr(products)) {
		out.push({
			kind: "product",
			title: o.listing_name ?? o.product_name ?? o.product?.name ?? o.items?.[0]?.product_name ?? i18n.t("account.productOrder", { defaultValue: "Product order" }),
			seller: o.seller_name ?? o.store_name ?? "—",
			amount: dashParseAmount(o.total_amount, o.total_price, o.amount),
			status: String(o.order_status ?? o.status ?? "pending").toLowerCase().replace(/\s+/g, "_"),
			date: o.created_at ?? o.ordered_at ?? null,
		});
	}
	for (const o of dashArr(food)) {
		out.push({
			kind: "food",
			title: o.food_order_items?.[0]?.food_item?.name ?? o.restaurant_name ?? o.food_vendor?.vendor_name ?? o.vendor_name ?? i18n.t("account.foodOrder", { defaultValue: "Food order" }),
			seller: o.food_vendor?.vendor_name ?? o.restaurant_name ?? o.vendor_name ?? "—",
			amount: dashParseAmount(o.total_amount, o.total_price, o.total, o.amount),
			status: String(o.order_status ?? o.status ?? "pending").toLowerCase().replace(/\s+/g, "_"),
			date: o.created_at ?? null,
		});
	}
	for (const o of parsePassengerRideHistoryItems(rides?.status === "fulfilled" ? rides.value : null)) {
		out.push({
			kind: "rideshare",
			title: i18n.t("account.rideTo", { dest: shortRideDestination(o.drop_address), defaultValue: `Ride to ${shortRideDestination(o.drop_address)}` }),
			seller: o.receipt?.driver_name ?? o.driver_name ?? "—",
			amount: dashParseAmount(o.receipt?.total_fare, o.total_fare, o.estimated_fare),
			status: String(o.status ?? "pending").toLowerCase(),
			date: o.receipt?.completed_at ?? o.completed_at ?? o.booked_at ?? o.created_at ?? null,
		});
	}
	for (const o of dashArr(services)) {
		out.push({
			kind: "service",
			title: o.service_name ?? o.service?.name ?? i18n.t("account.serviceOrder", { defaultValue: "Service order" }),
			seller: o.provider_name ?? o.provider?.name ?? "—",
			amount: dashParseAmount(o.total_price, o.amount),
			status: String(o.status ?? "pending").toLowerCase(),
			date: o.created_at ?? null,
		});
	}
	for (const o of dashArr(rentals)) {
		out.push({
			kind: "rental",
			title: o.listing_name ?? o.vehicle_name ?? o.listing?.name ?? i18n.t("account.rentalOrder", { defaultValue: "Rental" }),
			seller: o.host_name ?? o.owner_name ?? "—",
			amount: dashParseAmount(o.total_amount, o.total),
			status: String(o.status ?? "pending").toLowerCase(),
			date: o.created_at ?? null,
		});
	}
	for (const o of dashArr(appointments)) {
		out.push({
			kind: "viewing",
			title: o.note ? i18n.t("account.propertyViewingNote", { note: o.note, defaultValue: `Viewing — ${o.note}` }) : i18n.t("account.propertyViewing", { defaultValue: "Property viewing" }),
			seller: i18n.t("account.realEstateAgent", { defaultValue: "Real estate agent" }),
			amount: 0,
			status: String(o.status ?? "pending").toLowerCase(),
			date: o.date ?? o.created_at ?? null,
		});
	}
	for (const o of dashArr(testDrives)) {
		out.push({
			kind: "test_drive",
			title: [o.vehicle?.year, o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(" ") || i18n.t("account.testDrive", { defaultValue: "Test drive" }),
			seller: o.seller?.name ?? "—",
			amount: 0,
			status: String(o.status ?? "pending").toLowerCase(),
			date: o.preferred_date ?? o.created_at ?? null,
		});
	}
	for (const o of dashArr(mechanic)) {
		out.push({
			kind: "mechanic",
			title: o.booking_listing?.title ?? i18n.t("account.mechanicBooking", { defaultValue: "Mechanic booking" }),
			seller: o.host?.name ?? "—",
			amount: dashParseAmount(o.total),
			status: String(o.status ?? "requested").toLowerCase(),
			date: o.start_date ?? o.created_at ?? null,
		});
	}
	return out
		.map((a) => ({ ...a, _d: a.date ? new Date(a.date) : null }))
		.filter((a) => a._d && !Number.isNaN(a._d.getTime()))
		.sort((a, b) => b._d - a._d);
}

function mapDashWatchHistory(data) {
	const rows = Array.isArray(data) ? data : (data?.data ?? data?.history ?? []);
	return (Array.isArray(rows) ? rows : [])
		.map((entry) => {
			const v = entry.video ?? entry;
			return {
				id: v.video_id ?? v.id,
				title: v.title ?? "Untitled",
				channel: v.channel?.display_name ?? v.channel_name ?? "Creator",
				thumb: v.thumbnail_url ?? null,
				views: v.views_count ?? 0,
				watchedAt: entry.watched_at ?? v.updated_at ?? v.created_at ?? null,
			};
		})
		.filter((v) => v.id != null)
		.map((v) => ({ ...v, _d: v.watchedAt ? new Date(v.watchedAt) : null }))
		.sort((a, b) => (b._d?.getTime() || 0) - (a._d?.getTime() || 0));
}

function UserDashboardPage({ onNavigate }) {
	const { t } = useTranslation();
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const hour = new Date().getHours();
	const greeting = hour < 12 ? t("account.goodMorning") : hour < 18 ? t("account.goodAfternoon") : t("account.goodEvening");

	const [range, setRange] = useState("28d");
	const [metric, setMetric] = useState("spend");
	const [catHover, setCatHover] = useState(null);
	const [dashboardUser, setDashboardUser] = useState(() => getUser() || {});
	const [walletBalance, setWalletBalance] = useState(null);
	const [activity, setActivity] = useState([]);
	const [watched, setWatched] = useState([]);
	const [refAnalytics, setRefAnalytics] = useState(null);
	const [dataLoading, setDataLoading] = useState(true);

	const currency = dashboardUser?.currency || "CAD";
	const money = (n) => fmt(n, currency);

	useEffect(() => {
		const u = getUser();
		const uid = u?.user_id ?? u?.id;
		if (!uid) return;
		getMe(uid).then((data) => {
			const fresh = Array.isArray(data) ? data[0] : data;
			if (!fresh) return;
			setDashboardUser((current) => ({ ...current, ...fresh }));
			const current = getUser();
			if (current) setUser({ ...current, ...fresh });
		}).catch(() => {});
		getWalletBalance()
			.then((d) => { const b = d?.balance ?? d?.wallet_balance ?? d?.amount; if (b != null) setWalletBalance(parseFloat(b)); })
			.catch(() => {});
		getWatchHistory().then((d) => setWatched(mapDashWatchHistory(d))).catch(() => {});
		Promise.allSettled([
			getMyProductOrders(uid),
			getMyFoodOrders(),
			getPassengerRideHistory({ limit: 50 }),
			getServiceOrders(),
			getRentalOrders(),
			getAppointments(),
			getMyTestDriveRequests(),
			getBookings({ vertical: "mechanic", role: "guest" }),
		])
			.then((results) => setActivity(normalizeDashActivity(results)))
			.finally(() => setDataLoading(false));
	}, []);

	useEffect(() => {
		getReferralAnalytics(range).then((d) => setRefAnalytics(d?.data ?? d ?? null)).catch(() => setRefAnalytics(null));
	}, [range]);

	const dashboardName = dashboardUser?.name || dashboardUser?.username || dashboardUser?.handle || "Strug member";
	const dashboardVerified = isDocumentVerified(dashboardUser);
	const rangeLabel = (RANGE_OPTIONS.find((r) => r.id === range)?.label || "").toLowerCase();

	// Range window
	const { rangeStart, rangeEnd } = useMemo(() => {
		const end = new Date();
		const days = RANGE_DAYS[range];
		if (days == null) {
			const earliest = [
				...activity.map((a) => a._d?.getTime()),
				...watched.map((w) => w._d?.getTime()),
			].filter(Boolean);
			const start = earliest.length ? new Date(Math.min(...earliest)) : new Date(end.getTime() - 90 * 864e5);
			return { rangeStart: start, rangeEnd: end };
		}
		return { rangeStart: new Date(end.getTime() - (days - 1) * 864e5), rangeEnd: end };
	}, [range, activity, watched]);

	const rangedActivity = useMemo(() => {
		const lo = rangeStart.getTime() - 864e5, hi = rangeEnd.getTime() + 864e5;
		return activity.filter((a) => a._d && a._d.getTime() >= lo && a._d.getTime() <= hi);
	}, [activity, rangeStart, rangeEnd]);
	const rangedWatched = useMemo(() => {
		const lo = rangeStart.getTime() - 864e5, hi = rangeEnd.getTime() + 864e5;
		return watched.filter((w) => w._d && w._d.getTime() >= lo && w._d.getTime() <= hi);
	}, [watched, rangeStart, rangeEnd]);

	const totalSpent = rangedActivity.reduce((s, a) => s + (a.amount || 0), 0);
	const activeOrders = activity.filter((a) => isOrderHistoryInProgress({ status: a.status, deliveryMode: null })).length;
	const refSummary = refAnalytics?.summary ?? {};
	const refPeriod = refSummary.period_total ?? 0;

	// Daily trend series across the window
	const series = useMemo(() => {
		const days = Math.max(1, Math.min(400, Math.round((rangeEnd - rangeStart) / 864e5) + 1));
		const buckets = new Map();
		for (let i = 0; i < days; i++) {
			const k = dashDayKey(new Date(rangeStart.getTime() + i * 864e5));
			if (k) buckets.set(k, { date: k, spend: 0, orders: 0, videos: 0 });
		}
		for (const a of rangedActivity) {
			const b = buckets.get(dashDayKey(a._d));
			if (b) { b.spend += a.amount || 0; b.orders += 1; }
		}
		for (const w of rangedWatched) {
			const b = buckets.get(dashDayKey(w._d));
			if (b) b.videos += 1;
		}
		return [...buckets.values()];
	}, [rangedActivity, rangedWatched, rangeStart, rangeEnd]);

	const catSegments = useMemo(() => {
		const totals = {};
		for (const a of rangedActivity) {
			if (!(a.amount > 0)) continue;
			totals[a.kind] = (totals[a.kind] || 0) + a.amount;
		}
		return Object.entries(totals)
			.map(([kind, value]) => ({ label: DASH_CAT[kind]?.label ?? kind, color: DASH_CAT[kind]?.color ?? "#64748b", value }))
			.sort((a, b) => b.value - a.value);
	}, [rangedActivity]);

	const statusColor = (status) => {
		if (["completed", "delivered", "picked_up", "success"].includes(status)) return { text: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.28)" };
		if (["cancelled", "canceled", "declined", "rejected", "failed"].includes(status)) return { text: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.28)" };
		return { text: "#facc15", bg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.28)" };
	};

	const PAD_L = isMobile ? 16 : 108;
	const PAD_R = isMobile ? 16 : 40;

	if (loading) return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: PAD_L, paddingRight: PAD_R, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			<SkeletonHeading />
			<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 24 }}>
				{[...Array(6)].map((_, i) => <Skel key={i} w={200} h={104} r={16} />)}
			</div>
			<Skel h={280} r={18} />
		</div>
	);

	const kpiIcon = (p) => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;

	return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: PAD_L, paddingRight: PAD_R, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			{/* Header */}
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22, animation: "fadeUp 0.3s ease both" }}>
				<div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,3vw,34px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{t("account.yourDashboard", { defaultValue: "Your dashboard" })}</h1>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{greeting},</span>
						<span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 10px", background: dashboardVerified ? "rgba(37,99,235,0.16)" : "var(--color-surface-raised)", border: `1px solid ${dashboardVerified ? "rgba(96,165,250,0.35)" : "var(--color-border)"}` }}>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800 }}>{dashboardName}</span>
							{dashboardVerified && <VerifiedIcon size={14} />}
						</span>
					</div>
				</div>
				<SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
			</div>

			{/* KPI cards */}
			<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24, animation: "fadeUp 0.3s ease 40ms both" }}>
				<KpiCard label={t("account.totalSpent", { defaultValue: "Total spent" })} countTo={totalSpent} formatValue={money} accent="#2563eb"
					sparkline={series.map((d) => d.spend)} icon={kpiIcon(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>)} />
				<KpiCard label={t("account.orders", { defaultValue: "Orders" })} countTo={rangedActivity.length} formatValue={(v) => formatCount(Math.round(v))} accent="#10b981"
					sparkline={series.map((d) => d.orders)} icon={kpiIcon(<><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></>)} />
				<KpiCard label={t("account.activeOrders", { defaultValue: "Active orders" })} value={dataLoading ? "—" : String(activeOrders)} accent="#f59e0b"
					icon={kpiIcon(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)} />
				<KpiCard label={t("account.walletBalance", { defaultValue: "Wallet balance" })} value={walletBalance == null ? "—" : money(walletBalance)} accent="#facc15"
					icon={kpiIcon(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>)} />
				<KpiCard label={t("account.videosWatched", { defaultValue: "Videos watched" })} countTo={rangedWatched.length} formatValue={(v) => formatCount(Math.round(v))} accent="#7c3aed"
					sparkline={series.map((d) => d.videos)} icon={kpiIcon(<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>)} />
				<KpiCard label={t("account.referralsShort", { defaultValue: "Referrals" })} value={money(refPeriod)} delta={refSummary.period_change_pct || null} accent="#06b6d4"
					icon={kpiIcon(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>)} />
			</div>

			{/* Trend */}
			<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", marginBottom: 24, animation: "fadeUp 0.3s ease 80ms both" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
					<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }}>{t("account.activityOverTime", { defaultValue: "Activity over time" })}</h3>
					<SegmentedControl size="sm" value={metric} onChange={setMetric} options={[
						{ id: "spend", label: t("account.spend", { defaultValue: "Spend" }), color: "#2563eb" },
						{ id: "orders", label: t("account.orders", { defaultValue: "Orders" }), color: "#10b981" },
						{ id: "videos", label: t("account.videos", { defaultValue: "Videos" }), color: "#7c3aed" },
					]} />
				</div>
				<TrendChart
					data={series}
					metric={metric}
					color={metric === "spend" ? "#2563eb" : metric === "orders" ? "#10b981" : "#7c3aed"}
					height={isMobile ? 180 : 240}
					formatValue={metric === "spend" ? money : (v) => formatCount(Math.round(v))}
				/>
			</div>

			{/* Category donut + recently watched */}
			<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 24 }}>
				<div className="border border-border" style={{ flex: 1, minWidth: isMobile ? "100%" : 260, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.3s ease 120ms both" }}>
					<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{t("account.spendingByCategory", { defaultValue: "Spending by category" })}</h3>
					{catSegments.length === 0 ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("account.noSpendInRange", { defaultValue: "No spending in this range yet." })}</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
							<DonutChart
								segments={catSegments}
								hoveredIndex={catHover}
								onHoverIndex={setCatHover}
								centerLabel={t("account.totalSpent", { defaultValue: "Total spent" })}
								centerValue={money(catSegments.reduce((s, c) => s + c.value, 0))}
							/>
							<div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
								{catSegments.map((c, i) => (
									<div key={c.label} onMouseEnter={() => setCatHover(i)} onMouseLeave={() => setCatHover(null)} onMouseOver={() => setCatHover(i)}
										style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 8, background: catHover === i ? "var(--color-surface-raised)" : "transparent", cursor: "default", transition: "background 0.15s" }}>
										<span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
										<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{c.label}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{money(c.value)}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="border border-border" style={{ flex: 2, minWidth: 0, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.3s ease 160ms both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }}>{t("account.recentlyWatched", { defaultValue: "Recently watched" })}</h3>
						<button onClick={() => onNavigate && onNavigate("videos")} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{t("account.openVideos", { defaultValue: "Open Videos" })} →</button>
					</div>
					{watched.length === 0 ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("account.noWatchHistory", { defaultValue: "Videos you watch will show up here." })}</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							{watched.slice(0, 6).map((v, i) => (
								<button key={v.id ?? i} onClick={() => onNavigate && onNavigate("videos")}
									style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
									<div style={{ width: 92, height: 52, borderRadius: 8, flexShrink: 0, ...(v.thumb ? { backgroundImage: `url(${v.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{[v.channel, v.watchedAt ? timeAgo(v.watchedAt) : null].filter(Boolean).join(" · ")}</p>
									</div>
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Recent activity */}
			<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.3s ease 200ms both" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
					<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }}>{t("account.recentActivity", { defaultValue: "Recent activity" })}</h3>
					<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{rangeLabel}</span>
				</div>
				{dataLoading ? (
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[...Array(4)].map((_, i) => <Skel key={i} h={54} r={12} />)}</div>
				) : rangedActivity.length === 0 ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 0" }}>{t("account.noRecentActivity", { defaultValue: "Nothing in this range yet." })}</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{rangedActivity.slice(0, 8).map((a, i) => {
							const sc = statusColor(a.status);
							const cat = DASH_CAT[a.kind] ?? { label: a.kind, color: "#64748b" };
							return (
								<div className="bg-surface border border-border-subtle" key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, gap: 12 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
										<span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `${cat.color}1c`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
											<span style={{ width: 12, height: 12, borderRadius: 4, background: cat.color, opacity: 0.9 }} />
										</span>
										<div style={{ minWidth: 0 }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{cat.label}{a.seller && a.seller !== "—" ? ` · ${a.seller}` : ""}</p>
										</div>
									</div>
									<div style={{ textAlign: "right", flexShrink: 0 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: "0 0 4px" }}>{a.amount > 0 ? money(a.amount) : "—"}</p>
										<div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{a._d.toLocaleDateString()}</span>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: sc.text, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "2px 8px", textTransform: "capitalize" }}>{a.status.replace(/_/g, " ")}</span>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
				<div style={{ marginTop: 16, textAlign: "center" }}>
					<button className="text-text-primary bg-surface-raised border border-border" onClick={() => onNavigate && onNavigate("orders")} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 22px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
						{t("account.viewAllActivity", { defaultValue: "View all orders" })} <span style={{ opacity: 0.55 }}>→</span>
					</button>
				</div>
			</div>
		</div>
	);
}

function shortRideDestination(address) {
	if (!address) return i18n.t("account.destination");
	const first = String(address).split(",")[0].trim();
	return first.length > 42 ? `${first.slice(0, 39)}…` : first;
}

function formatRideHistoryDate(iso) {
	if (!iso) return "—";
	try {
		return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
	} catch {
		return String(iso).split("T")[0];
	}
}

function mapRideHistoryToOrder(o) {
	const status = o.status ?? "pending";
	const receipt = o.receipt ?? null;
	const dateSrc = receipt?.completed_at ?? o.completed_at ?? o.booked_at ?? o.created_at;
	const date = dateSrc ? String(dateSrc).split("T")[0] : "—";
	const total = receipt?.total_fare ?? o.total_fare ?? o.estimated_fare ?? 0;
	const currency = receipt?.currency ?? o.currency ?? "CAD";
	return {
		id: `#RS-${o.ride_request_id}`,
		_rawId: o.ride_request_id,
		title: i18n.t("account.rideTo", { dest: shortRideDestination(o.drop_address) }),
		seller: receipt?.driver_name ?? o.driver_name ?? (status === "completed" ? i18n.t("account.driver") : i18n.t("rideshare.findingDriver")),
		amount: fmt(total, currency),
		status,
		date,
		rating: o.rating ?? null,
		deliveryTime: (receipt?.distance_km ?? o.distance_km) != null
			? `${(receipt?.distance_km ?? o.distance_km).toFixed(1)} km`
			: "—",
		rideDetail: {
			pickup: receipt?.pickup_address ?? o.pickup_address,
			dropoff: receipt?.drop_address ?? o.drop_address,
			vehicleType: receipt?.vehicle_type ?? o.vehicle_type,
			paymentMethod: receipt?.payment_method_label ?? o.payment_method,
			tripId: receipt?.trip_id ?? o.trip_id,
			pricingMode: o.pricing_mode === "set_price" ? i18n.t("rideshare.setYourPrice") : i18n.t("common.recommended"),
			completedAt: receipt?.completed_at ?? o.completed_at,
			bookedAt: o.booked_at ?? o.created_at,
		},
	};
}

function OrdersHistoryPage() {
	const { t } = useTranslation();
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad(150);
	const [activeTab, setActiveTab] = useState("all");
	const [ordersDialog, { confirm, notify }] = useDialog();
	const [searchQuery, setSearchQuery] = useState("");
	const [detailOrderId, setDetailOrderId] = useState(null);
	const [orders, setOrders] = useState([]);
	const [downloadingId, setDownloadingId] = useState(null);
	const [ordersPage, setOrdersPage] = useState(1);
	const [exporting, setExporting] = useState(false);
	const [rateOrderId, setRateOrderId] = useState(null);
	const [rateValue, setRateValue] = useState(0);
	const [rateComment, setRateComment] = useState("");
	const [rateBusy, setRateBusy] = useState(false);
	const [rateError, setRateError] = useState("");

	const submitOrderRating = async (order) => {
		if (rateValue === 0 || rateBusy || !order?._rawId) return;
		setRateBusy(true);
		setRateError("");
		try {
			if (order.isWorkJob) {
				await reviewWorkJob(order._rawId, rateValue, rateComment.trim() || undefined);
			} else {
				await submitBookingReview(order._rawId, { rating: rateValue, comment: rateComment.trim() || undefined });
			}
			setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, rating: rateValue } : o)));
			setRateOrderId(null);
		} catch (err) {
			setRateError(err?.response?.data?.message || t("account.rateSaveFailed", { defaultValue: "Couldn't save your rating. Try again later." }));
		} finally {
			setRateBusy(false);
		}
	};

	// Invoice PDF download (#260). Uses auth-store user only — `liveUser` lives in
	// another page component in this file and is not in scope here.
	const handleDownloadInvoice = async (order, e) => {
		e?.stopPropagation?.();
		if (!order || downloadingId === order.id) return;
		setDownloadingId(order.id);
		try {
			const u = getUser() || {};
			await downloadOrderInvoice(order, { name: u.name, email: u.email });
		} catch (err) {
			console.error("Invoice download failed:", err);
			await notify({
				title: t("account.downloadInvoiceFailedTitle", { defaultValue: "Download failed" }),
				message: t("account.downloadInvoiceFailed", { defaultValue: "Couldn't download the invoice. Please try again." }),
				confirmLabel: t("dialog.ok", { defaultValue: "OK" }),
			});
		} finally {
			setDownloadingId(null);
		}
	};

	// order.type is a raw identifier used for tab/chat-context matching (e.g.
	// "test_drive"), not display text — this is the only human label mapping.
	const orderTypeLabel = (type) =>
		type === "test_drive" ? t("account.testDrive") : type === "mechanic" ? t("account.mechanic") : type === "medical" ? t("account.medical", { defaultValue: "Medical" }) : type;
	// Status values come from several backends with different separators
	// ("in-progress" vs booking-engine's "awaiting_host") — normalize both to
	// spaces so CSS textTransform:capitalize title-cases every word, not just the first.
	const formatOrderStatus = (status) => String(status ?? "").replace(/[_-]/g, " ");

	const orderTypeIcon = (type) => {
		const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "#2563eb", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
		switch (type) {
			case "food":
				return <svg {...p}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>;
			case "rideshare":
			case "test_drive":
				return <svg {...p}><path d="M5 17h14M5 17a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4zM5 17l1.5-6.5A2 2 0 018.42 9h7.16a2 2 0 011.92 1.5L19 17M3 17h2m14 0h2M9 9V6a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>;
			case "service":
			case "mechanic":
			case "medical":
				return <svg {...p}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>;
			case "rental":
				return <svg {...p}><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>;
			case "viewing":
				return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
			default:
				return <svg {...p}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
		}
	};

	const fieldIcon = (key) => {
		const p = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-text-muted)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" };
		switch (key) {
			case "orderId": return <svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>;
			case "item": return <svg {...p}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
			case "person": return <svg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
			case "amount": return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
			case "status": return <svg {...p}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
			case "date": return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
			case "time": return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
			case "rating": return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
			case "location": return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
			case "payment": return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
			case "trend": return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
			case "route": return <svg {...p}><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
			case "hash": return <svg {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>;
			default: return <svg {...p}><path d="M20.59 13.41L11 3.83A2 2 0 009.83 3H4a2 2 0 00-2 2v5.83a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.83z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
		}
	};

	// Shared order-detail body (#367). Rendered inside the detail modal — row/eye-icon
	// clicks on both desktop and mobile just set `detailOrderId` to open it.
	const renderOrderDetailBody = (order) => (
		<>
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>{t("account.orderDetails")}</p>
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: "20px 16px" }}>
				{(order.type === "rideshare" && order.rideDetail
					? [
						["orderId", t("account.orderIdLabel"), order.id],
						["hash", i18n.t("account.tripId"), order.rideDetail.tripId ? `#${order.rideDetail.tripId}` : "—"],
						["location", i18n.t("rideshare.pickup"), order.rideDetail.pickup ?? "—"],
						["location", i18n.t("rideshare.dropoff"), order.rideDetail.dropoff ?? "—"],
						["person", t("account.driver"), order.seller],
						["item", i18n.t("rideshare.vehicle"), order.rideDetail.vehicleType ?? "—"],
						["amount", t("account.amountLabel"), order.amount],
						["payment", i18n.t("rideshare.paymentMethod"), order.rideDetail.paymentMethod ?? "—"],
						["trend", i18n.t("rideshare.pricing"), order.rideDetail.pricingMode ?? "—"],
						["route", i18n.t("rideshare.distance"), order.deliveryTime],
						["status", t("account.statusLabel"), formatOrderStatus(order.status)],
						["date", t("account.dateLabel"), formatRideHistoryDate(order.rideDetail.bookedAt)],
						["time", t("account.completed"), formatRideHistoryDate(order.rideDetail.completedAt)],
						["rating", t("account.ratingLabel"), order.rating ? `${"★".repeat(order.rating)}${"☆".repeat(5 - order.rating)}` : t("account.notRated")],
					]
					: [
						["orderId", t("account.orderIdLabel"), order.id],
						["item", t("account.typeLabel"), orderTypeLabel(order.type)],
						["item", t("account.itemLabel"), order.title],
						["person", t("account.sellerProviderLabel"), order.seller],
						["amount", t("account.amountLabel"), order.amount],
						["status", t("account.statusLabel"), formatOrderStatus(order.status)],
						["date", t("account.dateLabel"), new Date(order.date).toLocaleDateString()],
						["time", t("account.estDeliveryLabel"), order.deliveryTime],
						["rating", t("account.ratingLabel"), order.rating ? `${"★".repeat(order.rating)}${"☆".repeat(5 - order.rating)}` : t("account.notRated")],
					]
				).map(([iconKey, label, value], idx) => (
					<div key={`${label}-${idx}`}>
						<div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 4px" }}>
							{fieldIcon(iconKey)}
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
						</div>
						<p
							className={iconKey === "status" ? "" : "text-text-primary"}
							style={{
								fontFamily: "'DM Sans', sans-serif", fontWeight: iconKey === "orderId" ? 700 : 500, fontSize: 13.5, margin: 0,
								textTransform: iconKey === "status" ? "capitalize" : "none", wordBreak: "break-word",
								color: iconKey === "status" ? statusStyle(order.status).text : undefined,
							}}
						>{value}</p>
					</div>
				))}
			</div>
			<div style={{ borderTop: "1px solid var(--color-border-subtle)", margin: "20px 0 16px" }} />
			{(order.isBookingEngine || order.isWorkJob) && order._rawId && order.status === "completed" && !order.rating && (
				<button
					type="button"
					onClick={() => { setRateOrderId(order.id); setRateValue(0); setRateComment(""); setRateError(""); }}
					style={{ marginTop: 4, marginBottom: 14, padding: "8px 14px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
				>
					{t("account.rateAndReview", { defaultValue: "Rate & review" })}
				</button>
			)}
			{order.isBookingEngine && order._rawId && ["requested", "awaiting_host", "confirmed"].includes(String(order.status || "").toLowerCase()) && (
				<button
					type="button"
					onClick={async () => {
						if (!(await confirm({ title: t("account.cancelBookingTitle"), message: t("account.cancelBookingMsg"), confirmLabel: t("account.cancelBookingConfirm"), cancelLabel: t("account.cancelBookingKeep") }))) return;
						try {
							await cancelBooking(order._rawId);
							setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: "cancelled" } : o));
							setDetailOrderId(null);
						} catch { /* noop */ }
					}}
					style={{ marginTop: 4, marginBottom: 14, marginLeft: 8, padding: "8px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
				>
					{t("account.cancelBookingTitle")}
				</button>
			)}
			{rateOrderId === order.id && (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="order-rate-title"
					style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
				>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380 }}>
						<h3 id="order-rate-title" className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
							{t("account.rateAndReview", { defaultValue: "Rate & review" })}
						</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{order.title}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1, 2, 3, 4, 5].map((n) => (
								<button key={n} type="button" aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`} onClick={() => setRateValue(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rateValue ? "#f59e0b" : "none"} stroke={n <= rateValue ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea
							value={rateComment}
							onChange={(e) => setRateComment(e.target.value)}
							placeholder={t("common.optionalComment", { defaultValue: "Add a comment (optional)" })}
							rows={3}
							className="bg-surface-raised border border-border text-text-primary"
							style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }}
						/>
						{rateError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 12 }}>{rateError}</p>}
						<div style={{ display: "flex", gap: 10 }}>
							<button type="button" onClick={() => setRateOrderId(null)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
								{t("common.cancel", { defaultValue: "Cancel" })}
							</button>
							<button type="button" disabled={rateValue === 0 || rateBusy} onClick={() => submitOrderRating(order)} style={{ flex: 1, padding: "11px 0", minHeight: 44, background: rateValue > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rateValue > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rateValue > 0 && !rateBusy ? "pointer" : "default" }}>
								{rateBusy ? t("common.loading", { defaultValue: "Loading…" }) : t("common.submit", { defaultValue: "Submit" })}
							</button>
						</div>
					</div>
				</div>
			)}
			{order._rawId && ["food", "rideshare", "service", "rental", "product"].includes(order.type) && (
				<button
					type="button"
					onClick={() => openOrderChat(order.type, order._rawId, {
						returnNav: { id: "orders", label: t("account.backToOrders") },
					}).catch(() => {})}
					style={{ marginTop: 14, padding: "8px 14px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 8, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
				>
					{t("account.openOrderChat")}
				</button>
			)}
			{order.type === "product" && order._rawId && (
				<button
					type="button"
					onClick={() => {
						try {
							sessionStorage.setItem("strug_track_product_order_id", String(order._rawId));
						} catch {}
						window.__nav?.("shop");
					}}
					style={{ marginTop: 10, marginLeft: 8, padding: "8px 14px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 8, color: "#34d399", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
				>
					{t("shop.trackOrder", { defaultValue: "Track order" })}
				</button>
			)}
			{isMobile && order.type !== "test_drive" && (
			<button
				type="button"
				title={t("account.downloadInvoice", { defaultValue: "Download invoice (PDF)" })}
				disabled={downloadingId === order.id}
				onClick={(e) => handleDownloadInvoice(order, e)}
				style={{ marginTop: 14, padding: "8px 14px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: downloadingId === order.id ? "default" : "pointer", opacity: downloadingId === order.id ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
			>
				<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				{downloadingId === order.id
					? t("common.loading", { defaultValue: "Loading…" })
					: t("account.downloadInvoice", { defaultValue: "Download invoice (PDF)" })}
			</button>
			)}
			<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
				<button
					type="button"
					onClick={() => setDetailOrderId(null)}
					className="text-text-primary border border-border"
					style={{ padding: "10px 22px", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
				>
					{t("common.close", { defaultValue: "Close" })}
				</button>
			</div>
		</>
	);

	useEffect(() => {
		try {
			const tab = sessionStorage.getItem("strug_orders_tab");
			if (tab) {
				setActiveTab(tab);
				sessionStorage.removeItem("strug_orders_tab");
			}
		} catch { /* noop */ }
	}, []);

	useEffect(() => {
		let cancelled = false;
		let retryTimer;
		let loadSeq = 0;

		const normalize = (arr, type, mapFn) => (Array.isArray(arr) ? arr : (arr?.data ?? [])).map(mapFn).map(o => ({ ...o, type }));
		const firstImage = (raw) => {
			if (!raw) return null;
			try {
				const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
				return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
			} catch {
				return null;
			}
		};

		const applyOrderResults = (seq, products, food, rides, services, rentals, appointments, testDrives, mechanicBookings, professionalBookings, workJobs, medicalBookings) => {
			if (cancelled || seq !== loadSeq) return;
			const productList = normalize(products.value, "product", o =>
				normalizeBuyerProductOrder(o, i18n.t("account.productOrder")),
			);
			const foodList = normalize(food.value, "food", o => {
				// Buyer GET /food/orders returns food_order_id / total_amount / order_status
				// (and nested food_vendor / food_order_items) — not order_id / total_price / status.
				const rawId = o.food_order_id ?? o.order_id ?? o.id ?? null;
				const vendorLabel =
					o.restaurant_name
					?? o.vendor_name
					?? o.food_vendor?.vendor_name
					?? o.food_vendor?.name
					?? o.vendor?.vendor_name
					?? o.vendor?.name
					?? null;
				const firstItemName = o.food_order_items?.[0]?.food_item?.name
					?? o.food_order_items?.[0]?.name
					?? null;
				const statusRaw = o.order_status ?? o.status ?? "pending";
				return {
					id: `#FO-${rawId}`,
					_rawId: rawId,
					title: firstItemName ?? vendorLabel ?? i18n.t("account.foodOrder"),
					seller: vendorLabel ?? "—",
					amount: `$${parseFloat(o.total_amount ?? o.total_price ?? o.total ?? o.amount ?? 0).toFixed(2)}`,
					status: String(statusRaw).toLowerCase().replace(/\s+/g, "_"),
					// Needed so pickup `picked_up` counts as completed, while delivery
					// `picked_up` (courier in transit) stays in progress.
					deliveryMode: o.shipping_mode ?? o.delivery_mode ?? o.fulfillment_mode ?? null,
					date: o.created_at ? String(o.created_at).split("T")[0] : "—",
					rating: null,
					deliveryTime: "—",
				};
			});
			const ridePayload = rides.status === "fulfilled" ? rides.value : null;
			const rideList = parsePassengerRideHistoryItems(ridePayload).map((o) => ({ ...mapRideHistoryToOrder(o), type: "rideshare" }));
			const serviceList = normalize(services.value, "service", o => ({
				id: `#SO-${o.service_order_id ?? o.id}`,
				_rawId: o.service_order_id ?? o.order_id ?? o.id ?? null,
				title: o.service_name ?? o.service?.name ?? i18n.t("account.serviceOrder"),
				seller: o.provider_name ?? o.provider?.name ?? "—",
				amount: `$${parseFloat(o.total_price ?? o.amount ?? 0).toFixed(2)}`,
				status: o.status ?? "pending",
				date: o.created_at ? o.created_at.split("T")[0] : "—",
				rating: null, deliveryTime: "—",
			}));
			const rentalList = normalize(rentals.value, "rental", o => ({
				id: `#RN-${o.rental_order_id ?? o.id}`,
				_rawId: o.rental_order_id ?? o.id ?? null,
				title: o.listing_name ?? o.vehicle_name ?? o.listing?.name ?? i18n.t("account.rentalOrder"),
				seller: o.host_name ?? o.owner_name ?? "—",
				amount: `$${parseFloat(o.total_amount ?? o.total ?? 0).toFixed(2)}`,
				status: o.status ?? "pending",
				date: o.created_at ? o.created_at.split("T")[0] : "—",
				rating: null, deliveryTime: "—",
			}));
			const appointmentList = normalize(appointments.value, "viewing", o => ({
				id: `#VW-${o.appointment_id ?? o.id}`,
				title: o.note ? i18n.t("account.propertyViewingNote", { note: o.note }) : i18n.t("account.propertyViewing"),
				seller: i18n.t("account.realEstateAgent"),
				amount: "—",
				status: o.status ?? "pending",
				date: o.date ? String(o.date).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
				rating: null, deliveryTime: o.time_from ? String(o.time_from).split("T")[1]?.slice(0,5) : "—",
			}));
			// Buyer's own test drive requests — vehicle_id/model come from the vehicle
			// relation the /test-drive/my-requests endpoint includes.
			const testDriveList = normalize(testDrives.value, "test_drive", o => ({
				id: `#TD-${o.test_drive_request_id ?? o.id}`,
				_rawId: o.test_drive_request_id ?? o.id ?? null,
				title: [o.vehicle?.year, o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(" ")
					|| i18n.t("account.testDrive"),
				seller: o.seller?.name ?? "—",
				amount: "—",
				status: String(o.status ?? "pending").toLowerCase(),
				date: o.preferred_date ? String(o.preferred_date).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
				rating: null,
				deliveryTime: o.preferred_time ?? "—",
				pic: o.vehicle?.vehicle_pic_url || firstImage(o.vehicle?.images),
			}));
			// Mechanic bookings ride the shared booking-engine tables (vertical: 'mechanic'),
			// scoped to this buyer via ?role=guest&vertical=mechanic — not the service-order table.
			const mechanicList = normalize(mechanicBookings.value, "mechanic", o => ({
				id: `#MB-${o.booking_id ?? o.id}`,
				_rawId: o.booking_id ?? o.id ?? null,
				isBookingEngine: true,
				title: o.booking_listing?.title ?? i18n.t("account.mechanicBooking"),
				seller: o.host?.name ?? "—",
				amount: `$${parseFloat(o.total ?? 0).toFixed(2)}`,
				status: String(o.status ?? "requested").toLowerCase(),
				date: o.start_date ? String(o.start_date).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
				rating: o.booking_review?.rating ?? null,
				deliveryTime: o.start_time ?? "—",
				pic: firstImage(o.booking_listing?.images),
			}));
			// Professional (work/trade) service bookings ride the same shared booking-engine
			// tables as mechanic (vertical: 'professional') — surfaced under the Services tab
			// alongside serviceList so plumbers/electricians/etc. show up in order history.
			// isBookingEngine distinguishes these from legacy /service-order entries (whose
			// _rawId is a service_order_id, not a booking_id — submitBookingReview would hit
			// the wrong record if we let those through the rate-and-review gate below).
			const professionalList = normalize(professionalBookings.value, "service", o => ({
				id: `#PB-${o.booking_id ?? o.id}`,
				_rawId: o.booking_id ?? o.id ?? null,
				isBookingEngine: true,
				title: o.booking_listing?.title ?? i18n.t("account.serviceOrder"),
				seller: o.host?.name ?? "—",
				amount: `$${parseFloat(o.total ?? 0).toFixed(2)}`,
				status: String(o.status ?? "requested").toLowerCase(),
				date: o.start_date ? String(o.start_date).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
				rating: o.booking_review?.rating ?? null,
				deliveryTime: o.start_time ?? "—",
				pic: firstImage(o.booking_listing?.images),
			}));
			const medicalList = normalize(medicalBookings.value, "medical", o => ({
				id: `#MD-${o.booking_id ?? o.id}`,
				_rawId: o.booking_id ?? o.id ?? null,
				isBookingEngine: true,
				title: o.booking_listing?.title ?? i18n.t("account.medicalBooking", { defaultValue: "Doctor appointment" }),
				seller: o.host?.name ?? "—",
				amount: `$${parseFloat(o.total ?? 0).toFixed(2)}`,
				status: String(o.status ?? "requested").toLowerCase(),
				date: o.start_date ? String(o.start_date).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
				rating: o.booking_review?.rating ?? null,
				deliveryTime: o.start_time ?? "—",
				pic: firstImage(o.booking_listing?.images),
			}));
			// On-demand work jobs (OnDemandHire "hire nearest worker" flow) — a separate
			// system from the booking-engine verticals above. Surfaced under the Services
			// tab too, but flagged isWorkJob (not isBookingEngine) since rating one goes
			// through POST /work-jobs/:id/review, not submitBookingReview.
			const workList = normalize(workJobs.value, "service", o => {
				const amount = o.price_type === "hourly" && o.hourly_rate != null
					? (o.hourly_rate || 0) * (o.duration_hours || 0)
					: (o.hirer_set_price ?? o.worker_payout ?? 0);
				return {
					id: `#WJ-${o.work_job_id}`,
					_rawId: o.work_job_id ?? null,
					isWorkJob: true,
					title: o.title ?? o.work_category?.name ?? i18n.t("account.serviceOrder"),
					seller: o.worker_name ?? "—",
					amount: `$${amount.toFixed(2)}`,
					status: String(o.status ?? "requested").toLowerCase(),
					date: o.scheduled_start ? String(o.scheduled_start).split("T")[0] : (o.created_at ? String(o.created_at).split("T")[0] : "—"),
					rating: o.work_review?.[0]?.rating ?? null,
					deliveryTime: o.scheduled_start ? String(o.scheduled_start).split("T")[1]?.slice(0, 5) : "—",
				};
			});
			setOrders([...productList, ...foodList, ...rideList, ...serviceList, ...professionalList, ...workList, ...rentalList, ...appointmentList, ...testDriveList, ...mechanicList, ...medicalList].sort((a, b) => b.date.localeCompare(a.date)));
		};

		const loadOrders = async () => {
			const seq = ++loadSeq;
			let token = getToken();
			if (!token) token = await refreshAccessToken();
			if (!token) return;

			const uid = getAuthUserId();
			if (!uid && !retryTimer) {
				retryTimer = window.setTimeout(() => {
					retryTimer = null;
					loadOrders();
				}, 400);
			}

			Promise.allSettled([
				uid ? getMyProductOrders(uid) : Promise.resolve({ data: [] }),
				getMyFoodOrders(),
				getPassengerRideHistory({ limit: 50 }),
				getServiceOrders(),
				getRentalOrders(),
				getAppointments(),
				// Both endpoints resolve the caller's identity from the auth token
				// server-side (buyer_id / guest_id) — never take a user id as a param,
				// so these can't be pointed at another user's bookings.
				getMyTestDriveRequests(),
				getBookings({ vertical: "mechanic", role: "guest" }),
				getBookings({ vertical: "professional", role: "guest" }),
				getWorkJobHistory(),
				getBookings({ vertical: "medical", role: "guest" }),
			]).then((results) => applyOrderResults(seq, ...results));
		};

		loadOrders();
		window.addEventListener("strug:view-change", loadOrders);
		return () => {
			cancelled = true;
			if (retryTimer) clearTimeout(retryTimer);
			window.removeEventListener("strug:view-change", loadOrders);
		};
	}, []);

	const { completed, inProgress, cancelled } = summarizeOrderHistory(orders);
	const orderStats = [
		{ label: t("account.totalOrders"),  value: String(orders.length), change: orders.length === 0 ? t("account.noOrdersYet") : t("account.completedCount", { count: completed }), color: "#60a5fa" },
		{ label: t("account.completed"),     value: String(completed),     change: orders.length > 0 ? t("account.successRate", { pct: Math.round(completed/orders.length*100) }) : "—", color: "#4ade80" },
		{ label: t("account.inProgress"),   value: String(inProgress),    change: inProgress > 0 ? t("account.expectedSoon") : t("account.noneActive"),      color: "#facc15" },
		{ label: t("account.cancelled"),     value: String(cancelled),     change: orders.length > 0 ? t("account.cancelRate", { pct: Math.round(cancelled/orders.length*100) }) : "—", color: "#f87171" },
	];
	const tabs = [
		{ id: "all",       label: t("account.allOrders"), count: orders.length },
		{ id: "product",   label: t("account.products"),   count: orders.filter(o => o.type === "product").length },
		{ id: "food",      label: t("account.food"),        count: orders.filter(o => o.type === "food").length },
		{ id: "rideshare", label: t("account.rides"),       count: orders.filter(o => o.type === "rideshare").length },
		{ id: "service",   label: t("account.services"),    count: orders.filter(o => o.type === "service").length },
		{ id: "rental",    label: t("account.rentals"),     count: orders.filter(o => o.type === "rental").length },
		{ id: "viewing",   label: t("account.viewings"),    count: orders.filter(o => o.type === "viewing").length },
		{ id: "mechanic",   label: t("account.mechanic"),    count: orders.filter(o => o.type === "mechanic").length },
		{ id: "medical",    label: t("account.medical", { defaultValue: "Medical" }), count: orders.filter(o => o.type === "medical").length },
		{ id: "test_drive", label: t("account.testDrives"), count: orders.filter(o => o.type === "test_drive").length },
	];

	const filteredOrders = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return orders.filter((o) =>
			(activeTab === "all" || o.type === activeTab)
			&& (!q || o.title.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
		);
	}, [orders, activeTab, searchQuery]);

	const ordersTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE) || 1);
	const safeOrdersPage = Math.min(ordersPage, ordersTotalPages);
	const pagedOrders = useMemo(() => {
		const start = (safeOrdersPage - 1) * ORDERS_PAGE_SIZE;
		return filteredOrders.slice(start, start + ORDERS_PAGE_SIZE);
	}, [filteredOrders, safeOrdersPage]);

	useEffect(() => {
		setOrdersPage(1);
	}, [activeTab, searchQuery]);

	useEffect(() => {
		if (ordersPage > ordersTotalPages) setOrdersPage(ordersTotalPages);
	}, [ordersPage, ordersTotalPages]);

	const handleExportOrders = async () => {
		if (exporting) return;
		if (filteredOrders.length === 0) {
			await notify({
				title: t("account.exportOrdersEmptyTitle", { defaultValue: "Nothing to export" }),
				message: t("account.exportOrdersEmpty", { defaultValue: "No orders match the current filters." }),
				confirmLabel: t("dialog.ok", { defaultValue: "OK" }),
			});
			return;
		}
		setExporting(true);
		try {
			// Sync CSV from in-memory filteredOrders — no network, no PDF work.
			const result = exportOrdersCsv(filteredOrders);
			if (!result.ok) {
				await notify({
					title: t("account.exportOrdersEmptyTitle", { defaultValue: "Nothing to export" }),
					message: t("account.exportOrdersEmpty", { defaultValue: "No orders match the current filters." }),
					confirmLabel: t("dialog.ok", { defaultValue: "OK" }),
				});
			}
		} catch (err) {
			console.error("Orders export failed:", err);
			await notify({
				title: t("account.exportOrdersFailedTitle", { defaultValue: "Export failed" }),
				message: t("account.exportOrdersFailed", { defaultValue: "Couldn't export orders. Please try again." }),
				confirmLabel: t("dialog.ok", { defaultValue: "OK" }),
			});
		} finally {
			setExporting(false);
		}
	};
	function statusStyle(status) {
		if (status === "completed" || status === "delivered") return { bg: "rgba(74,222,128,0.1)", text: "#4ade80", border: "rgba(74,222,128,0.25)" };
		// Match provider dashboard "Picked Up" badge color (#60a5fa).
		if (status === "picked_up" || status === "pickedup") return { bg: "rgba(96,165,250,0.12)", text: "#60a5fa", border: "rgba(96,165,250,0.3)" };
		if (status === "in-progress" || status === "shipped" || status === "accepted" || status === "ongoing" || status === "preparing" || status === "ready_for_pickup" || status === "ready") return { bg: "rgba(250,204,21,0.1)", text: "#facc15", border: "rgba(250,204,21,0.25)" };
		if (status === "cancelled" || status === "canceled" || status === "rejected" || status === "declined") return { bg: "rgba(248,113,113,0.1)", text: "#f87171", border: "rgba(248,113,113,0.25)" };
		return { bg: "var(--color-surface-raised)", text: "var(--color-text-secondary)", border: "var(--color-border)" };
	}
	const goBackFromOrders = () => {
		// Previously hardcoded to "groceries" regardless of where the user actually came from —
		// see App.jsx's navigateTo, which stamps window.__ordersReturnNav on the way in here.
		const returnTo = window.__ordersReturnNav || "home";
		window.__ordersReturnNav = null;
		window.__nav?.(returnTo);
	};

	if (loading) return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: 40, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			<SkeletonHeading />
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 16, marginTop: 24 }}>
				<Skel h={90} r={14} /><Skel h={90} r={14} /><Skel h={90} r={14} /><Skel h={90} r={14} />
			</div>
			<div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
				{[1,2,3,4,5].map(i => <Skel key={i} h={60} r={10} />)}
			</div>
		</div>
	);

	return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			{ordersDialog}
			<button
				type="button"
				onClick={goBackFromOrders}
				style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 14, padding: "9px 12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
			>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				<span>{t("common.back", { defaultValue: "Back" })}</span>
			</button>
			{/* Hero */}
			<div className="border border-border" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)", borderRadius: 20, padding: "28px 36px", marginBottom: 24, animation: "fadeUp 0.3s ease both" }}>
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 0 }}>
					<div>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,3vw,38px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, marginBottom: 6 }}>{t("account.ordersHistory")}</h1>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{t("account.ordersHeroDesc")}</p>
					</div>
					<button
						type="button"
						onClick={handleExportOrders}
						disabled={exporting || filteredOrders.length === 0}
						className={`bg-surface-raised border border-border ${exporting || filteredOrders.length === 0 ? "text-text-muted" : "text-text-primary"}`}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 18px",
							borderRadius: 10,
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: 600,
							fontSize: 13,
							cursor: exporting || filteredOrders.length === 0 ? "default" : "pointer",
							opacity: exporting ? 0.7 : 1,
						}}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
						{exporting
							? t("common.loading", { defaultValue: "Loading…" })
							: t("account.export")}
					</button>
				</div>
				<div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
			</div>

			{/* Stats */}
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 16, marginBottom: 24, animation: "fadeUp 0.3s ease 60ms both" }}>
				{orderStats.map((stat, i) => (
					<div className="bg-surface-raised border border-border" key={i} style={{ borderRadius: 16, padding: "18px 20px" }}>
						<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
							<div style={{ width: 28, height: 28, borderRadius: 8, background: `${stat.color}18`, border: `1px solid ${stat.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
								<div style={{ width: 10, height: 10, borderRadius: "50%", background: stat.color }} />
							</div>
						</div>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 34, letterSpacing: "0.02em", lineHeight: 1, margin: 0 }}>{stat.value}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginTop: 4 }}>{stat.label}</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }}>{stat.change}</p>
					</div>
				))}
			</div>

			{/* Search + tabs panel */}
			<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "20px 24px", marginBottom: 16, animation: "fadeUp 0.3s ease 90ms both" }}>
				<div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
					<div style={{ flex: 1, minWidth: isMobile ? "100%" : "auto", position: "relative" }}>
						<svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
						<input className="text-text-primary bg-surface-raised border border-border" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} aria-label={i18n.t("account.searchOrders")} placeholder={i18n.t("account.searchOrders")} style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
					</div>
					{[[t("account.filter"), "M22 3H2l8 9.46V19l4 2V12.46L22 3"], [t("account.sort"), "M17 3v18M11 9l6-6 6 6M7 21V3M1 15l6 6 6-6"]].map(([label, d]) => (
						<button className="text-text-secondary bg-surface-raised border border-border" key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
							{label}
						</button>
					))}
				</div>
				<div className="bg-surface-raised" style={{ display: "flex", gap: 6, borderRadius: 10, padding: 4, overflowX: isMobile ? "auto" : "visible" }}>
					{tabs.map(tab => (
						<button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: isMobile ? "0 0 auto" : 1, padding: "8px 6px", borderRadius: 8, border: activeTab === tab.id ? "1px solid rgba(37,99,235,0.4)" : "1px solid transparent", background: activeTab === tab.id ? "rgba(37,99,235,0.15)" : "none", color: activeTab === tab.id ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
							{tab.label} ({tab.count})
						</button>
					))}
				</div>
			</div>

			{/* Orders table */}
			{(() => {
				const rangeStart = filteredOrders.length === 0 ? 0 : (safeOrdersPage - 1) * ORDERS_PAGE_SIZE + 1;
				const rangeEnd = Math.min(safeOrdersPage * ORDERS_PAGE_SIZE, filteredOrders.length);
				return (
			<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.3s ease 120ms both" }}>
				{filteredOrders.length === 0 ? (
					<div style={{ padding: "40px 24px", textAlign: "center" }}>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{orders.length === 0 ? t("account.noOrdersYetPeriod") : t("account.noOrdersMatchSearch")}</p>
					</div>
				) : isMobile ? (
					<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
						{pagedOrders.map((order, i) => {
							const sc = statusStyle(order.status);
							return (
								<div key={order.id ?? i} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}><div onClick={() => setDetailOrderId(order.id)} {...clickableProps(() => setDetailOrderId(order.id))} aria-haspopup="dialog" style={{ padding: "14px 16px", cursor: "pointer" }}>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
										<div>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{order.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{order.id} · {order.seller}</p>
										</div>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, flexShrink: 0, marginLeft: 8 }}>{order.amount}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: sc.text, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "3px 10px", textTransform: "capitalize" }}>{formatOrderStatus(order.status)}</span>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{new Date(order.date).toLocaleDateString()}</p>
									</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<>
						<div className="bg-surface-raised" style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 80px", gap: 12, padding: "13px 24px", borderBottom: "1px solid var(--color-border-subtle)" }}>
							{[t("account.orderCol"), t("account.detailsCol"), t("account.amountCol"), t("account.statusCol"), t("account.dateCol"), t("account.actionsCol")].map(h => (
								<p className="text-text-secondary" key={h} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{h}</p>
							))}
						</div>
						{pagedOrders.map((order, i) => {
							const sc = statusStyle(order.status);
							return (
								<React.Fragment key={order.id ?? i}>
								<div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 80px", gap: 12, padding: "15px 24px", borderBottom: "1px solid var(--color-border-subtle)", alignItems: "center", transition: "background 0.15s", cursor: "pointer" }}
									onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; }}
									onMouseLeave={e => { e.currentTarget.style.background = ""; }}
									onClick={() => setDetailOrderId(order.id)}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
										<div className="bg-surface-raised border border-border" style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
										</div>
										<div>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{order.id}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, textTransform: "capitalize" }}>{orderTypeLabel(order.type)}</p>
										</div>
									</div>
									<div>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, margin: 0, marginBottom: 2 }}>{order.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{order.seller}</p>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>⏱ {order.deliveryTime}</p>
									</div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{order.amount}</p>
									<div>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: sc.text, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "3px 10px", textTransform: "capitalize", whiteSpace: "nowrap" }}>{formatOrderStatus(order.status)}</span>
									</div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{new Date(order.date).toLocaleDateString()}</p>
									<div style={{ display: "flex", gap: 6 }}>
										<button onClick={(e) => { e.stopPropagation(); setDetailOrderId(order.id); }} aria-haspopup="dialog" aria-label="View order details" style={{ width: 30, height: 30, borderRadius: 7, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
											<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
										</button>
										{order.type === "rental" && order._rawId && ["pending", "confirmed"].includes(order.status) && (
											<button onClick={async (e) => { e.stopPropagation(); if (!(await confirm({ title: t("account.cancelBookingTitle"), message: t("account.cancelBookingMsg"), confirmLabel: t("account.cancelBookingConfirm"), cancelLabel: t("account.cancelBookingKeep") }))) return; try { await declineRentalOrder(order._rawId); setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "cancelled" } : o)); } catch { /* noop */ } }} style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title={t("account.cancelBookingTitle")}>
												<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
											</button>
										)}
										{order.isBookingEngine && order._rawId && ["requested", "awaiting_host", "confirmed"].includes(String(order.status || "").toLowerCase()) && (
											<button onClick={async (e) => { e.stopPropagation(); if (!(await confirm({ title: t("account.cancelBookingTitle"), message: t("account.cancelBookingMsg"), confirmLabel: t("account.cancelBookingConfirm"), cancelLabel: t("account.cancelBookingKeep") }))) return; try { await cancelBooking(order._rawId); setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "cancelled" } : o)); } catch { /* noop */ } }} style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title={t("account.cancelBookingTitle")}>
												<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
											</button>
										)}
										{order.type !== "test_drive" && (
										<button className="bg-surface-raised border border-border" title={t("account.downloadInvoice", { defaultValue: "Download invoice (PDF)" })} disabled={downloadingId === order.id} onClick={(e) => handleDownloadInvoice(order, e)} style={{ width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: downloadingId === order.id ? "default" : "pointer", opacity: downloadingId === order.id ? 0.6 : 1 }}>
											<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
										</button>
										)}
									</div>
								</div>
								</React.Fragment>
							);
						})}
					</>
				)}
				{filteredOrders.length > 0 && (
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12, padding: "13px 24px", borderTop: "1px solid var(--color-border-subtle)" }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>
						{t("account.showingOrdersRange", {
							defaultValue: "Showing {{from}}–{{to}} of {{total}}",
							from: rangeStart,
							to: rangeEnd,
							total: filteredOrders.length,
						})}
					</p>
					<Pagination
						page={safeOrdersPage}
						totalItems={filteredOrders.length}
						pageSize={ORDERS_PAGE_SIZE}
						onChange={setOrdersPage}
						prevLabel={t("common.previous", { defaultValue: "Previous" })}
						nextLabel={t("common.next", { defaultValue: "Next" })}
						style={isMobile ? { justifyContent: "center" } : undefined}
					/>
				</div>
				)}
			</div>
			);
			})()}
			{detailOrderId && (() => {
				const modalOrder = orders.find(o => o.id === detailOrderId);
				if (!modalOrder) return null;
				return (
					<div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setDetailOrderId(null)}>
						<div className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: 24, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
									{(() => {
										const hasPic = (modalOrder.type === "test_drive" || modalOrder.isBookingEngine) && modalOrder.pic;
										return (
											<div style={{ width: hasPic ? 68 : 44, height: hasPic ? 68 : 44, borderRadius: hasPic ? 14 : 12, background: "rgba(37,99,235,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
												{hasPic
													? <img src={modalOrder.pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
													: orderTypeIcon(modalOrder.type)}
											</div>
										);
									})()}
									<div style={{ minWidth: 0 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16.5, margin: 0, wordBreak: "break-word" }}>{modalOrder.title}</p>
										<span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#60a5fa", marginTop: 5 }}>{modalOrder.id}</span>
									</div>
								</div>
								<button onClick={() => setDetailOrderId(null)} aria-label={t("common.close", { defaultValue: "Close" })} className="text-text-secondary" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", flexShrink: 0 }}>&#215;</button>
							</div>
							<div style={{ borderTop: "1px solid var(--color-border-subtle)", margin: "18px 0 0" }} />
							<div style={{ marginTop: 20 }}>
								{renderOrderDetailBody(modalOrder)}
							</div>
						</div>
					</div>
				);
			})()}
		</div>
	);
}

function Toggle({ on, onToggle, disabled = false, label }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={!!on}
			aria-pressed={!!on}
			aria-label={label || undefined}
			disabled={disabled}
			onClick={disabled ? undefined : onToggle}
			aria-disabled={disabled || undefined}
			style={{ position: "relative", width: 44, height: 24, borderRadius: 12, background: on ? "#2563eb" : "var(--color-border)", border: "none", cursor: disabled ? "not-allowed" : "pointer", transition: "background 0.2s", flexShrink: 0, opacity: disabled ? 0.45 : 1 }}
		>
			{/* Knob stays a fixed white circle (standard toggle convention in both themes); the
			    shadow gives it definition against a light-theme track/card that's also pale. */}
			<div style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px var(--color-shadow)", transition: "left 0.2s" }} />
		</button>
	);
}
function SettingRow({ label, desc, children }) {
	const control = React.isValidElement(children) && children.type === Toggle
		? React.cloneElement(children, { label: children.props.label || label })
		: children;
	return (
		<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, marginBottom: 8 }}>
			<div>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0, marginBottom: 3 }}>{label}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{desc}</p>
			</div>
			{control}
		</div>
	);
}

function UserSettingsPage() {
	const { t } = useTranslation();
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad(150);
	const uid = useId(); // unique prefix for label/field associations in the profile form
	const [activeTab, setActiveTab] = useState("account");
	const [privacy, setPrivacy] = useState(() => {
		const defaults = { showOnlineStatus: true, allowMessages: true, dataCollection: false, thirdPartySharing: false };
		try { const s = localStorage.getItem("strug_privacy_prefs"); return s ? { ...defaults, ...JSON.parse(s) } : defaults; } catch { return defaults; }
	});
	const [profileVisibility, setProfileVisibility] = useState(() => {
		const v = localStorage.getItem("strug_profile_visibility") || "public";
		return v === "friends" ? "private" : v;
	});
	const [selectedCurrency, setSelectedCurrency] = useState(() => getUser()?.currency || "CAD");
	const [dateFormat, setDateFormat] = useState(() => localStorage.getItem("strug_date_format") || "mmddyyyy");
	const [timeFormat, setTimeFormat] = useState(() => localStorage.getItem("strug_time_format") || "12");
	const [timeZone, setTimeZone] = useState(() => localStorage.getItem("strug_timezone") || "utcMinus5Eastern");
	// #492 — friend-video-activity prefs (persisted server-side; the watch-page rail reads them).
	const [videoActivity, setVideoActivity] = useState({ share_video_activity: false, show_friend_video_activity: true });
	const [blockedAccounts, setBlockedAccounts] = useState([]);
	const [blockedAccountsLoading, setBlockedAccountsLoading] = useState(false);
	const [blockedAccountsError, setBlockedAccountsError] = useState("");
	const [unblockingProfileId, setUnblockingProfileId] = useState(null);
	const [followRequests, setFollowRequests] = useState([]);
	const [followRequestsLoading, setFollowRequestsLoading] = useState(false);
	const [followRequestsError, setFollowRequestsError] = useState("");
	const [followRequestActionId, setFollowRequestActionId] = useState(null);
	useEffect(() => {
		let alive = true;
		if (!getAuthUserId()) return;
		getFriendActivityPrefs()
			.then((p) => { if (alive && p) setVideoActivity({ share_video_activity: !!p.share_video_activity, show_friend_video_activity: p.show_friend_video_activity !== false }); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);
	function toggleVideoActivity(key) {
		setVideoActivity((prev) => {
			const previous = !!prev[key];
			const next = { ...prev, [key]: !previous };
			updateFriendActivityPrefs({ [key]: next[key] }).catch(() => {
				setVideoActivity((cur) => ({ ...cur, [key]: previous }));
				setSaveMsg(t("account.failedSaveMsg"));
				setTimeout(() => setSaveMsg(""), 3000);
			});
			return next;
		});
	}
	const loadBlockedAccounts = useCallback(() => {
		if (!getAuthUserId()) return Promise.resolve();
		setBlockedAccountsLoading(true);
		setBlockedAccountsError("");
		return getBlockedUsers()
			.then((result) => {
				const rows = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
				setBlockedAccounts(rows);
			})
			.catch((err) => setBlockedAccountsError(apiMessage(err) || "Could not load blocked accounts."))
			.finally(() => setBlockedAccountsLoading(false));
	}, []);
	const loadFollowRequests = useCallback(() => {
		if (!getAuthUserId()) return Promise.resolve();
		setFollowRequestsLoading(true);
		setFollowRequestsError("");
		return getFollowRequests()
			.then((result) => {
				const rows = Array.isArray(result?.data) ? result.data : [];
				setFollowRequests(rows);
			})
			.catch((err) => setFollowRequestsError(apiMessage(err) || t("account.followRequestsLoadFailed", "Could not load follow requests.")))
			.finally(() => setFollowRequestsLoading(false));
	}, [t]);
	useEffect(() => {
		if (activeTab === "privacy") {
			loadBlockedAccounts();
			loadFollowRequests();
		}
	}, [activeTab, loadBlockedAccounts, loadFollowRequests]);
	async function handleAcceptFollowRequest(row) {
		const pid = row?.requester_profile_id;
		if (!pid || followRequestActionId) return;
		setFollowRequestActionId(pid);
		setFollowRequestsError("");
		try {
			await acceptFollowRequest(pid);
			setFollowRequests((rows) => rows.filter((r) => r.requester_profile_id !== pid));
		} catch (err) {
			setFollowRequestsError(apiMessage(err) || t("account.followRequestAcceptFailed", "Could not accept request."));
		} finally {
			setFollowRequestActionId(null);
		}
	}
	async function handleRejectFollowRequest(row) {
		const pid = row?.requester_profile_id;
		if (!pid || followRequestActionId) return;
		setFollowRequestActionId(pid);
		setFollowRequestsError("");
		try {
			await rejectFollowRequest(pid);
			setFollowRequests((rows) => rows.filter((r) => r.requester_profile_id !== pid));
		} catch (err) {
			setFollowRequestsError(apiMessage(err) || t("account.followRequestRejectFailed", "Could not decline request."));
		} finally {
			setFollowRequestActionId(null);
		}
	}
	async function handleUnblockAccount(account) {
		if (!account?.profile_id || unblockingProfileId) return;
		setUnblockingProfileId(account.profile_id);
		setBlockedAccountsError("");
		try {
			await unblockUser(account.profile_id);
			setBlockedAccounts((rows) => rows.filter((row) => row.profile_id !== account.profile_id));
			// Messages inbox filters on strug_blocked (user ids). Clear the matching id so
			// the conversation reappears without a manual localStorage wipe.
			if (account.user_id != null) {
				removeBlockedUserIdFromStorage(account.user_id);
				notifyBlockedUsersChanged();
			}
		} catch (err) {
			setBlockedAccountsError(apiMessage(err) || "Could not unblock this account.");
		} finally {
			setUnblockingProfileId(null);
		}
	}
	const [deleteDialog, { confirm: confirmDelete, notify: notifyDelete }] = useDialog();
	const [deletingAccount, setDeletingAccount] = useState(false);
	async function handleDeleteAccount() {
		if (deletingAccount) return;
		const ok = await confirmDelete({
			title: t("account.deleteAccountTitle"),
			message: t("account.deleteAccountConfirm"),
			confirmLabel: t("account.deleteAccountAction"),
			cancelLabel: t("common.cancel"),
		});
		if (!ok) return;
		const uid = getUser()?.user_id ?? getAuthUserId();
		if (!uid) return;
		setDeletingAccount(true);
		try {
			await deleteMyAccount(uid);
			// Tear down the session exactly like sign-out: revoke the refresh cookie so the
			// deleted account can't be silently restored, then clear local auth and redirect.
			try { await revokeRefreshCookie(); } catch { /* noop */ }
			clearAuth();
			window.dispatchEvent(new Event("strug:logout"));
			window.location.href = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
		} catch (err) {
			setDeletingAccount(false);
			await notifyDelete({ title: t("account.deleteAccountFailedTitle"), message: err?.response?.data?.error ?? err?.message ?? t("account.deleteAccountFailed") });
		}
	}
	const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem("strug_language") || "en");
	const [showPassword, setShowPassword] = useState(false);
	const [cpCurrent, setCpCurrent] = useState("");
	const [cpNew, setCpNew] = useState("");
	const [cpConfirm, setCpConfirm] = useState("");
	const [cpError, setCpError] = useState(null);
	const [cpSuccess, setCpSuccess] = useState(false);
	const [cpLoading, setCpLoading] = useState(false);
	const [avatarPreview, setAvatarPreview] = useState(() => getUser()?.profile_pic_url || null);
	const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
	const [settingsAddPaymentLoading, setSettingsAddPaymentLoading] = useState(false);
	const [settingsAddPaymentError, setSettingsAddPaymentError] = useState("");
	const [settingsAddPaymentDone, setSettingsAddPaymentDone] = useState(false);
	const settingsStripe = useStripe();
	const settingsElements = useElements();
	const avatarInputRef = useRef(null);
		const [fullName, setFullName] = useState(() => getUser()?.name || getUser()?.username || "");
		const [userEmail, setUserEmail] = useState(() => getUser()?.email || "");
		const [userBio, setUserBio] = useState("");
		const [birthdate, setBirthdate] = useState("");
		const [initialBirthdate, setInitialBirthdate] = useState("");
		const [birthdateError, setBirthdateError] = useState("");
	// #436: opt-in "available for work" status. null = not set = no badge on the profile.
	const [workStatus, setWorkStatus] = useState(null);
	const [userHandle, setUserHandle] = useState("");
	// The handle as last loaded/saved from the server. Editing only the bio must not
	// re-submit an unchanged handle (BUG #329: a no-op handle PATCH could 400 with
	// "handle already taken" against the user's own row in another namespace).
	const [initialHandle, setInitialHandle] = useState("");
	const [userCountry, setUserCountry] = useState(() => getUser()?.country || "");
	const [userCity, setUserCity] = useState(() => getUser()?.city || "");
	// React state so Account Status re-renders after getMe → setUser (session storage alone does not).
	const [documentVerified, setDocumentVerified] = useState(() => isDocumentVerified(getUser()));
	const [handleError, setHandleError] = useState("");
	const [saveLoading, setSaveLoading] = useState(false);
	const [saveMsg, setSaveMsg] = useState("");
	const [removingCardId, setRemovingCardId] = useState(null);
	const [realPaymentMethods, setRealPaymentMethods] = useState([]);
	// #193 background web push (delivered when the tab is closed, via the service worker).
	const [push, setPush] = useState({ supported: false, permission: "default", subscribed: false, busy: false });
	// Mirrors web-push-service.PUSH_CATEGORIES on the backend. Everything defaults ON — the stored
	// `categories` map is a sparse OPT-OUT, so a missing key means "allowed", not "muted".
	const [pushCats, setPushCats] = useState({
		chat: true, social: true, orders: true, rides: true, work: true,
		quotes: true, live: true, video: true, townhall: true, payments: true, system: true,
	});

	useEffect(() => {
		if (!isPushSupported()) { setPush(p => ({ ...p, supported: false })); return; }
		setPush(p => ({ ...p, supported: true, permission: pushPermission() }));
		isSubscribed().then(sub => setPush(p => ({ ...p, subscribed: sub }))).catch(() => {});
		getPushPreferences().then(d => { if (d?.categories) setPushCats(c => ({ ...c, ...d.categories })); }).catch(() => {});
	}, []);

	async function handleEnablePush() {
		setPush(p => ({ ...p, busy: true }));
		try {
			const res = await subscribeToPush(pushCats);
			const sub = await isSubscribed();
			setPush(p => ({ ...p, busy: false, permission: pushPermission(), subscribed: Boolean(sub && res.ok) }));
		} catch { setPush(p => ({ ...p, busy: false, permission: pushPermission() })); }
	}
	async function handleDisablePush() {
		setPush(p => ({ ...p, busy: true }));
		try { await unsubscribeFromPush(); } catch { /* ignore */ }
		setPush(p => ({ ...p, busy: false, subscribed: false }));
	}
	// Optimistic, but NOT fail-open: a silently-failed save would leave the switch showing "muted"
	// while the server keeps pushing. Roll it back so what you see is what's actually stored.
	function handleTogglePushCat(key) {
		const previous = pushCats[key] !== false;
		const next = { ...pushCats, [key]: !previous };
		setPushCats(next);
		updatePushPreferences(next).catch(() => setPushCats(cur => ({ ...cur, [key]: previous })));
	}

	useEffect(() => {
		const uid = getUser()?.user_id;
		if (uid) getMe(uid).then(d => {
			const u = Array.isArray(d) ? d[0] : d;
			if (u) {
				setFullName(u.name || u.username || "");
				setUserEmail(u.email || "");
				// BUG #26: bio is persisted on the social profile (PATCH /social-profile/me),
				// not the user record — only seed from the user row if it actually has one,
				// so an empty user.bio doesn't clobber the real value loaded from getMyProfile().
				if (u.bio) setUserBio(u.bio);
				if (u.currency) setSelectedCurrency(u.currency);
				if (u.country) setUserCountry(u.country);
				if (u.city) setUserCity(u.city);
				syncLanguageFromUser(u).then((lang) => {
					if (lang) setSelectedLang(lang);
				});
				if (u.profile_pic_url && !getUser()?.profile_pic_url) setAvatarPreview(u.profile_pic_url);
				const current = getUser();
				if (current) {
					const verified = isDocumentVerified(u);
					setDocumentVerified(verified);
					setUser({ ...current, ...u, document_verified: verified });
				}
			}
		}).catch(() => {});
			getMyProfile().then(d => {
			const p = d?.data ?? d;
			if (p?.handle) { setUserHandle(p.handle); setInitialHandle(p.handle); }
			// BUG #26: social profile is the source of truth for bio — pre-fill it so a save
			// that doesn't retype the bio no longer wipes it.
			if (p?.bio) setUserBio(p.bio);
			// #436: same reasoning as the bio above — pre-fill it so a save that doesn't touch the
			// dropdown doesn't clear the status the user already set.
			setWorkStatus(p?.work_status ?? null);
			if (typeof p?.is_private === "boolean") {
				const vis = p.is_private ? "private" : "public";
				setProfileVisibility(vis);
				try { localStorage.setItem("strug_profile_visibility", vis); } catch {}
			}
			if (typeof p?.show_activity_status === "boolean") {
				setPrivacy(prev => {
					const next = { ...prev, showOnlineStatus: p.show_activity_status };
					try { localStorage.setItem("strug_privacy_prefs", JSON.stringify(next)); } catch {}
					return next;
				});
			}
				if (p?.profile_pic_url) setAvatarPreview(prev => prev || p.profile_pic_url);
			}).catch(() => {});
			getDatingMe().then(d => {
				const profile = d?.data ?? d;
				if (profile?.birthdate) {
					const nextBirthdate = String(profile.birthdate).slice(0, 10);
					setBirthdate(nextBirthdate);
					setInitialBirthdate(nextBirthdate);
				}
			}).catch(() => {});
			getPaymentMethods().then(data => {
			if (Array.isArray(data)) setRealPaymentMethods(data);
		}).catch(() => {});
		// Addresses load separately via GET /user/addresses (see addresses effect below).
	}, []);

		async function handleSaveProfile() {
			setSaveLoading(true); setSaveMsg(""); setHandleError(""); setBirthdateError("");
			try {
				if (birthdate && !isAdultBirthdate(birthdate)) {
					setBirthdateError("Dating is restricted to users 18 or older.");
					setSaveLoading(false);
					return;
				}
				let birthdateSaved = false;
				if (birthdate && birthdate !== initialBirthdate) {
					try {
						const payload = await updateDatingProfile({ birthdate, adult_confirmed: true });
						if (payload?.adult) {
							try { localStorage.setItem("strug_dating_age_gate", "adult"); } catch {}
						}
						setInitialBirthdate(birthdate);
						birthdateSaved = true;
					} catch (err) {
						setBirthdateError(apiMessage(err) || "Failed to save date of birth.");
						return;
					}
				}
				const userId = getUser()?.user_id;
				const tasks = [
				updateUser(userId, {
					name: fullName,
					country: userCountry || undefined,
					city: userCity.trim() || undefined,
					currency: selectedCurrency || undefined,
				}),
				updateSocialProfile({
					bio: userBio,
					...(fullName.trim() ? { display_name: fullName.trim() } : {}),
					work_status: WORK_STATUSES.includes(workStatus) ? workStatus : null,
				}),
			];
			// Only submit the handle when it actually changed — a save that only touches
			// the bio/name must not re-PATCH the current handle (BUG #329).
			const nextHandle = userHandle.trim().toLowerCase();
				if (nextHandle && nextHandle !== initialHandle.trim().toLowerCase()) {
					tasks.push(updateHandle(nextHandle));
				}
			const results = await Promise.allSettled(tasks);
			const failed = results.find((result) => result.status === "rejected");
			if (failed) {
				const msg = apiMessage(failed.reason);
				if (msg.includes("handle") || msg.includes("taken")) setHandleError(msg);
				else setSaveMsg(birthdateSaved ? "Date of birth saved. Other profile changes failed." : t("account.failedSaveMsg"));
				return;
			}
			if (nextHandle) setInitialHandle(nextHandle);
			const current = getUser();
			if (current) {
				const fresh = await getMyProfile().catch(() => null);
				const updated = {
					...current,
					name: fullName,
					bio: userBio,
					...(userCountry ? { country: userCountry } : {}),
					...(userCity.trim() ? { city: userCity.trim() } : {}),
					...(fresh?.profile_pic_url ? { profile_pic_url: fresh.profile_pic_url } : {}),
					...(fresh?.handle ? { handle: fresh.handle } : {}),
				};
				setUser(updated);
				// PR1: notify AppInner so sidebar/feed header re-read from localStorage
				window.dispatchEvent(new CustomEvent("strug:user-updated", { detail: updated }));
			}
			setSaveMsg(t("account.savedMsg"));
		} catch (err) {
			const msg = apiMessage(err);
			if (msg.includes("handle") || msg.includes("taken")) setHandleError(msg);
			else if (msg.toLowerCase().includes("birthdate") || msg.toLowerCase().includes("dating") || msg.toLowerCase().includes("18")) setBirthdateError(msg);
			else setSaveMsg(t("account.failedSaveMsg"));
		} finally {
			setSaveLoading(false);
			setTimeout(() => setSaveMsg(""), 3000);
		}
	}

	async function handleAvatarChange(e) {
		const f = e.target.files?.[0];
		if (!f) return;
		setAvatarPreview(URL.createObjectURL(f));
		try {
			const result = await updateProfilePhoto(f);
			if (result?.profile_pic_url) {
				setAvatarPreview(result.profile_pic_url);
				// PR1: persist avatar URL in localStorage and notify AppInner
				const current = getUser();
				if (current) {
					const updated = { ...current, profile_pic_url: result.profile_pic_url };
					setUser(updated);
					window.dispatchEvent(new CustomEvent("strug:user-updated", { detail: updated }));
				}
			}
			setSaveMsg(t("account.photoUpdatedMsg"));
			setTimeout(() => setSaveMsg(""), 3000);
		} catch {
			setSaveMsg(t("account.photoUploadFailedMsg"));
			setTimeout(() => setSaveMsg(""), 3000);
		}
	}
	const [addresses, setAddresses] = useState([]);
	useEffect(() => {
		getAddresses().then(d => setAddresses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
	}, []);
	const [showAddAddr, setShowAddAddr] = useState(false);
	const [newAddr, setNewAddr] = useState({ label: "", street: "", city: "", country: "", lat: undefined, lng: undefined });
	const [addrLoading, setAddrLoading] = useState(false);

	async function handleAddAddress() {
		if (!newAddr.label.trim() || !newAddr.street.trim()) return;
		setAddrLoading(true);
		try {
			// Server-backed: the default (first) address auto-propagates to user.saved_address
			// platform-wide. Re-fetch so default ordering + ids stay authoritative.
			await addAddress({
				label: newAddr.label.trim(),
				street: newAddr.street.trim(),
				city: newAddr.city.trim() || undefined,
				country: newAddr.country.trim() || undefined,
				lat: newAddr.lat ?? undefined,
				lng: newAddr.lng ?? undefined,
			});
			const d = await getAddresses();
			setAddresses(Array.isArray(d) ? d : (d?.data ?? []));
			setNewAddr({ label: "", street: "", city: "", country: "", lat: undefined, lng: undefined });
			setShowAddAddr(false);
		} catch (err) {
			setSaveMsg(apiMessage(err) || t("account.addAddressFailed", { defaultValue: "Could not add address." }));
			setTimeout(() => setSaveMsg(""), 4000);
		}
		setAddrLoading(false);
	}

	async function handleDownloadMyData() {
		try {
			const { data } = await client.get("/social-compliance/export");
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `strug-data-export-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			setSaveMsg(t("account.downloadMyDataDone", { defaultValue: "Download started." }));
			setTimeout(() => setSaveMsg(""), 3000);
		} catch (err) {
			setSaveMsg(apiMessage(err) || t("account.downloadMyDataFailed", { defaultValue: "Could not download your data." }));
			setTimeout(() => setSaveMsg(""), 4000);
		}
	}

	async function handleSettingsAddPayment() {
		if (!settingsStripe || !settingsElements) return;
		setSettingsAddPaymentLoading(true);
		setSettingsAddPaymentError("");
		try {
			const { clientSecret } = await createSetupIntent();
			const result = await settingsStripe.confirmCardSetup(clientSecret, {
				payment_method: { card: settingsElements.getElement(CardElement) },
			});
			if (result.error) {
				setSettingsAddPaymentError(result.error.message ?? t("account.cardSetupFailed"));
				return;
			}
			setSettingsAddPaymentDone(true);
			getPaymentMethods().then(data => {
				if (Array.isArray(data)) setRealPaymentMethods(data);
			}).catch(() => {});
			setTimeout(() => {
				setShowAddPaymentModal(false);
				setSettingsAddPaymentDone(false);
			}, 2000);
		} catch (e) {
			setSettingsAddPaymentError(e?.response?.data?.error ?? e?.message ?? t("account.failedSetupCard"));
		} finally {
			setSettingsAddPaymentLoading(false);
		}
	}

	async function handleChangePassword() {
		setCpError(null);
		setCpSuccess(false);
		if (!cpCurrent || !cpNew || !cpConfirm) { setCpError(t("account.allFieldsRequired")); return; }
		if (cpNew !== cpConfirm) { setCpError(t("account.passwordsNoMatch")); return; }
		if (cpNew.length < 8) { setCpError(t("account.passwordMinLength")); return; }
		setCpLoading(true);
		try {
			await changePassword({ currentPassword: cpCurrent, newPassword: cpNew });
			setCpSuccess(true);
			setCpCurrent(""); setCpNew(""); setCpConfirm("");
			// Security: log out after password change so user re-authenticates with new credentials
			setTimeout(async () => {
				// Revoke the refresh cookie too, else the old session is silently restored
				// after a password change (bugs #207/#225). Await before redirect.
				await revokeRefreshCookie();
				clearAuth();
				window.dispatchEvent(new Event("strug:logout"));
				window.location.href = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
			}, 1500);
		} catch (err) {
			setCpError(err?.response?.data?.message ?? err?.message ?? t("account.failedUpdatePassword"));
		} finally {
			setCpLoading(false);
		}
	}

	const tabs = [
		{ id: "account",       label: t("account.tabAccount") },
		{ id: "security",      label: t("account.tabSecurity") },
		{ id: "notifications", label: t("account.tabNotifications") },
		{ id: "privacy",       label: t("account.tabPrivacy") },
		{ id: "language",      label: t("account.languageRegion") },
		{ id: "billing",       label: t("account.tabBilling") },
	];

	const settingsTabLabels = {
		account: t("account.tabAccount"),
		security: t("account.tabSecurity"),
		notifications: t("account.tabNotifications"),
		privacy: t("account.tabPrivacy"),
		language: t("account.languageRegion"),
		billing: t("account.tabBilling"),
	};
	// Unmemoized: usePageBreadcrumb re-registering every render is harmless here.
	usePageBreadcrumb(settingsTabLabels[activeTab] ? [{ label: settingsTabLabels[activeTab] }] : []);

	// inputStyle/selectStyle are left with inline var(--color-*) (not className) because
	// inputStyle is also spread into AddressAutocomplete's `inputStyle` prop below, which is
	// documented elsewhere in this file as intentionally staying a self-contained inline style
	// object (the component doesn't merge a className for color purposes) — splitting the color
	// out of this shared object would silently break that prop.
	const inputStyle = { width: "100%", padding: "12px 16px", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };
	const selectStyle = { ...inputStyle, colorScheme: "dark", cursor: "pointer" };
	const cardClassName = "bg-surface-raised border border-border";
	const cardStyle  = { borderRadius: 16, padding: "24px", marginBottom: 16 };
	const cardTitle  = (t) => <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 16 }}>{t}</p>;

	if (loading) return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: 40, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			<SkeletonHeading />
			<div style={{ display: "flex", gap: 24, marginTop: 24 }}>
				<Skel w={220} h={300} r={14} />
				<Skel style={{ flex: 1 }} h={400} r={14} />
			</div>
		</div>
	);

	const privacyDescs = { showOnlineStatus: t("account.privacyOnline"), allowMessages: t("account.privacyMessages"), dataCollection: t("account.privacyAnalytics"), thirdPartySharing: t("account.privacyThirdParty") };
	const privacyLabels = { showOnlineStatus: t("account.privacyOnlineLabel"), allowMessages: t("account.privacyMessagesLabel"), dataCollection: t("account.privacyAnalyticsLabel"), thirdPartySharing: t("account.privacyThirdPartyLabel") };

	function renderContent() {
		if (activeTab === "account") return (
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.profilePhoto"))}
					<div style={{ display: "flex", alignItems: "center", gap: 20 }}>
						<div onClick={() => avatarInputRef.current?.click()} {...clickableProps(() => avatarInputRef.current?.click())} aria-label="Change profile photo" style={{ position: "relative", width: 80, height: 80, borderRadius: "50%", cursor: "pointer", flexShrink: 0 }}>
							{avatarPreview ? (
								<img loading="lazy" decoding="async" src={avatarPreview} alt="Avatar" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(37,99,235,0.5)" }} />
							) : (
								<div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "2px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
								</div>
							)}
							<div style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-bg)" }}>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
							</div>
						</div>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: "0 0 6px" }}>{t("account.uploadProfilePhoto")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px" }}>{t("account.photoHint")}</p>
							<button onClick={() => avatarInputRef.current?.click()} style={{ padding: "8px 16px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }}>{t("account.choosePhoto")}</button>
						</div>
						<input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
					</div>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.profileInformation"))}
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-fullname`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.fullName")}</label>
							<input id={`${uid}-fullname`} type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
						</div>
							<div>
								<label className="text-text-secondary" htmlFor={`${uid}-email`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.emailAddress")}</label>
								<input id={`${uid}-email`} type="email" value={userEmail} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
							</div>
							<div>
								<label className="text-text-secondary" htmlFor={`${uid}-birthdate`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Date of birth</label>
								<ThemedBirthdatePicker
									id={`${uid}-birthdate`}
									value={birthdate}
									max={adultCutoffValue()}
									onChange={next => { setBirthdate(next); setBirthdateError(""); }}
									error={Boolean(birthdateError)}
								/>
								{birthdateError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", margin: "6px 0 0" }}>{birthdateError}</p>}
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "6px 0 0" }}>Used to verify adult access for Dating.</p>
							</div>
						</div>
					<div style={{ marginBottom: 16 }}>
						<label className="text-text-secondary" htmlFor={`${uid}-handle`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.handle")} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t("account.handleUnique")}</span></label>
						<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 0, border: `1px solid ${handleError ? "#f87171" : "var(--color-border)"}`, borderRadius: 12, overflow: "hidden" }}>
							<span className="text-text-muted" style={{ padding: "12px 12px 12px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>@</span>
							<input id={`${uid}-handle`} type="text" value={userHandle} onChange={e => { setUserHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "")); setHandleError(""); }} style={{ ...inputStyle, border: "none", borderRadius: 0, background: "transparent", paddingLeft: 0 }} placeholder={t("app.profileSetup.handlePlaceholder")} />
						</div>
						{handleError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 4 }}>{handleError}</p>}
					</div>
					<div>
						<label className="text-text-secondary" htmlFor={`${uid}-bio`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.bio")}</label>
						<textarea id={`${uid}-bio`} rows={3} value={userBio} maxLength={500} onChange={e => setUserBio(e.target.value)} style={{ ...inputStyle, resize: "none" }} />
					</div>
					{/* #436: LinkedIn-style opt-in status. Off by default — no value means the profile
					    shows no badge at all, rather than asserting something about the user. */}
					<div style={{ marginTop: 16 }}>
						<label className="text-text-secondary" htmlFor={`${uid}-workstatus`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.workStatus")}</label>
						<select id={`${uid}-workstatus`} value={workStatus ?? ""} onChange={e => setWorkStatus(e.target.value || null)} style={inputStyle}>
							<option value="">{t("account.workStatusNone")}</option>
							{WORK_STATUSES.map(s => <option key={s} value={s}>{t(`account.workStatusOptions.${s}`)}</option>)}
						</select>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "6px 0 0" }}>{t("account.workStatusHint")}</p>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
						<div>
							<label className="text-text-secondary" id={`${uid}-country`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Country</label>
							<CountrySelect value={userCountry} onChange={setUserCountry} ariaLabelledBy={`${uid}-country`} />
							{userCountry && currencyForCountry(userCountry) && (
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "6px 0 0" }}>Prices shown in {currencyForCountry(userCountry)}. You're charged in CAD.</p>
							)}
						</div>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-city`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>City <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
							<input id={`${uid}-city`} type="text" value={userCity} onChange={e => setUserCity(e.target.value)} maxLength={80} style={inputStyle} />
						</div>
					</div>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle("Appearance")}
					<SettingRow label="Theme" desc="Switch between dark and light mode. Applies everywhere and remembers your choice on this device.">
						<ThemeToggle />
					</SettingRow>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.accountStatus"))}
					{documentVerified ? (
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: "#4ade80" }}>
									{t("account.identityVerified", { defaultValue: "Identity verified" })}
								</span>
							</div>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						</div>
					) : (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.45 }}>
							{t("account.accountStatusUnavailable", {
								defaultValue: "Live account health and suspension status are not shown here yet. Identity verification appears when your documents are verified.",
							})}
						</p>
					)}
				</div>
			<div className={cardClassName} style={cardStyle}>
				{cardTitle(t("account.referralCode"))}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, marginBottom: 12 }}>
					<div>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0, marginBottom: 2 }}>{t("account.yourCode")}</p>
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#60a5fa", letterSpacing: "0.08em", margin: 0 }}>{getUser()?.ref_code || "—"}</p>
					</div>
					<button onClick={() => navigator.clipboard?.writeText(getUser()?.ref_code || "")} style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 10, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }}>{t("account.copy")}</button>
				</div>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12 }}>{t("account.referralCodeSettingsDesc")}</p>
				<button className="text-text-secondary border border-border" onClick={() => window.__nav("refcodes")} style={{ background: "none", borderRadius: 10, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t("account.manageReferralCodes")}</button>
			</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.savedAddresses"))}
					{addresses.map(addr => (
						<div className="bg-surface-raised" key={addr.address_id ?? addr.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, marginBottom: 8 }}>
							<div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
								<div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
								</div>
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: "0 0 3px" }}>{addr.label}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{addr.street}{addr.city ? `, ${addr.city}` : ""}{addr.country ? `, ${addr.country}` : ""}</p>
								</div>
							</div>
							<button onClick={() => { const aid = addr.address_id ?? addr.id; setAddresses(prev => prev.filter(a => (a.address_id ?? a.id) !== aid)); deleteAddress(aid).catch(() => {}); }} style={{ background: "none", border: "none", color: "rgba(255,100,100,0.6)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>{t("account.remove")}</button>
						</div>
					))}
					{showAddAddr ? (
						<div className="bg-surface-raised" style={{ borderRadius: 12, padding: 16, marginTop: 8 }}>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
								<input value={newAddr.label} onChange={e => setNewAddr(p => ({ ...p, label: e.target.value }))} placeholder={t("account.addrLabelPlaceholder")} style={{ ...inputStyle }} />
								<input value={newAddr.city} onChange={e => setNewAddr(p => ({ ...p, city: e.target.value }))} placeholder={t("account.city")} style={{ ...inputStyle }} />
							</div>
							<div style={{ position: "relative", marginBottom: 10 }}>
								<AddressAutocomplete value={newAddr.street} onChange={(val, lat, lng) => setNewAddr(p => ({ ...p, street: val, lat, lng }))} placeholder={t("account.streetAddress")} useLocation wrapStyle={{ display: "block", width: "100%" }} inputStyle={{ ...inputStyle, display: "block", width: "100%", boxSizing: "border-box" }} />
							</div>
							<input value={newAddr.country} onChange={e => setNewAddr(p => ({ ...p, country: e.target.value }))} placeholder={t("account.country")} style={{ ...inputStyle, marginBottom: 12, display: "block" }} />
							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={handleAddAddress} disabled={addrLoading || !newAddr.label.trim() || !newAddr.street.trim()} style={{ color: "#fff", padding: "9px 20px", background: "#2563eb", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: addrLoading ? 0.7 : 1 }}>{addrLoading ? t("account.saving") : t("account.save")}</button>
								<button className="text-text-secondary border border-border" onClick={() => { setShowAddAddr(false); setNewAddr({ label: "", street: "", city: "", country: "", lat: undefined, lng: undefined }); }} style={{ padding: "9px 20px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t("common.cancel")}</button>
							</div>
						</div>
					) : (
						<button onClick={() => setShowAddAddr(true)} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "rgba(37,99,235,0.08)", border: "1px dashed rgba(37,99,235,0.3)", borderRadius: 12, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", width: "100%" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							Add Address
						</button>
					)}
				</div>
			</div>
		);
		if (activeTab === "security") return (
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.passwordAuth"))}
					<div style={{ marginBottom: 16 }}>
						<label className="text-text-secondary" htmlFor={`${uid}-current-pw`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.currentPassword")}</label>
						<div style={{ position: "relative" }}>
							<input id={`${uid}-current-pw`} type={showPassword ? "text" : "password"} placeholder={t("account.currentPasswordPlaceholder")} value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} />
							<button className="text-text-secondary" onClick={() => setShowPassword(p => !p)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									{showPassword ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
								</svg>
							</button>
						</div>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-new-pw`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.newPassword")}</label>
							<input id={`${uid}-new-pw`} type="password" placeholder={t("account.newPassword")} value={cpNew} onChange={e => setCpNew(e.target.value)} style={inputStyle} />
						</div>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-confirm-pw`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.confirmPassword")}</label>
							<input id={`${uid}-confirm-pw`} type="password" placeholder={t("account.confirmPassword")} value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} style={inputStyle} />
						</div>
					</div>
					{cpError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12 }}>{cpError}</p>}
						{cpSuccess && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#4ade80", marginBottom: 12 }}>{t("account.passwordUpdated")}</p>}
						<button onClick={handleChangePassword} disabled={cpLoading} style={{ color: "#fff", padding: "11px 24px", background: "#2563eb", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: cpLoading ? "not-allowed" : "pointer", opacity: cpLoading ? 0.7 : 1 }}>{cpLoading ? t("account.updating") : t("account.updatePassword")}</button>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.twoFactor"))}
					{[{ label: t("account.smsAuth"), desc: t("account.smsAuthDesc"), enabled: false }, { label: t("account.authenticatorApp"), desc: t("account.authenticatorAppDesc"), enabled: false }].map(item => (
						<div className="bg-surface-raised" key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, marginBottom: 8 }}>
							<div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0, marginBottom: 3 }}>{item.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{item.desc}</p>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<button disabled title="Coming soon" style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)", color: "rgba(96,165,250,0.55)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "not-allowed", opacity: 0.7 }}>{t("account.setup")} · Coming soon</button>
							</div>
						</div>
					))}
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.activeSessions"))}
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.45 }}>
						{t("account.sessionsComingSoon", {
							defaultValue: "Session list and remote sign-out are not available yet. Only password change works on this tab today.",
						})}
					</p>
				</div>
			</div>
		);
		if (activeTab === "notifications") return (
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.pushBrowserTitle"))}
					{!push.supported ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("account.pushUnsupported")}</p>
					) : push.permission === "denied" ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("account.pushBlocked")}</p>
					) : !push.subscribed ? (
						<div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 14px" }}>{t("account.pushEnableDesc")}</p>
							<button onClick={handleEnablePush} disabled={push.busy} style={{ color: "#fff", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: push.busy ? "default" : "pointer", opacity: push.busy ? 0.6 : 1 }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
								{push.busy ? t("account.pushEnabling") : t("account.pushEnableBtn")}
							</button>
						</div>
					) : (
						<div>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
								<span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("account.pushActive")}</p>
							</div>
							{[
								{ key: "chat", label: t("account.pushCatChat"), desc: t("account.pushCatChatDesc") },
								{ key: "social", label: t("account.pushCatSocial"), desc: t("account.pushCatSocialDesc") },
								{ key: "orders", label: t("account.pushCatOrders"), desc: t("account.pushCatOrdersDesc") },
								{ key: "rides", label: t("account.pushCatRides"), desc: t("account.pushCatRidesDesc") },
								{ key: "work", label: t("account.pushCatWork"), desc: t("account.pushCatWorkDesc") },
								{ key: "quotes", label: t("account.pushCatQuotes"), desc: t("account.pushCatQuotesDesc") },
								{ key: "live", label: t("account.pushCatLive"), desc: t("account.pushCatLiveDesc") },
								{ key: "video", label: t("account.pushCatVideo"), desc: t("account.pushCatVideoDesc") },
								{ key: "townhall", label: t("account.pushCatTownhall"), desc: t("account.pushCatTownhallDesc") },
								{ key: "payments", label: t("account.pushCatPayments"), desc: t("account.pushCatPaymentsDesc") },
								{ key: "system", label: t("account.pushCatSystem"), desc: t("account.pushCatSystemDesc") },
							].map(c => (
								<SettingRow key={c.key} label={c.label} desc={c.desc}>
									<Toggle on={pushCats[c.key] !== false} onToggle={() => handleTogglePushCat(c.key)} />
								</SettingRow>
							))}
							<button className="text-text-secondary border border-border" onClick={handleDisablePush} disabled={push.busy} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: push.busy ? "default" : "pointer" }}>
								{t("account.pushDisableBtn")}
							</button>
						</div>
					)}
				</div>
				{/* The old "Notification Preferences" card lived here: 7 toggles (email, promotions,
				    securityAlerts, weeklyReports, …) persisted to localStorage under
				    `strug_notif_prefs` and read by NOTHING — no API, no bell, no toast hook. They
				    looked authoritative while changing nothing. Removed rather than left lying;
				    the push categories above are the only preferences the backend enforces. */}
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.notificationChannels"))}
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
						<div className="bg-surface-raised" style={{ padding: "18px", borderRadius: 12, textAlign: "center", opacity: 0.85 }}>
							<div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
								<div style={{ width: 16, height: 16, borderRadius: "50%", background: "#60a5fa", opacity: 0.85 }} />
							</div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 3 }}>{t("account.emailChannel")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, lineHeight: 1.4 }}>
								{t("account.emailChannelUnavailable", {
									defaultValue: "Email notification preferences are not available yet.",
								})}
							</p>
						</div>
						<div className="bg-surface-raised" style={{ padding: "18px", borderRadius: 12, textAlign: "center" }}>
							<div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
								<div style={{ width: 16, height: 16, borderRadius: "50%", background: "#c084fc", opacity: 0.85 }} />
							</div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 3 }}>{t("account.pushChannel")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>
								{!push.supported
									? t("account.pushUnsupported")
									: push.subscribed
										? t("account.pushActive")
										: t("account.pushChannelSub")}
							</p>
						</div>
					</div>
				</div>
			</div>
		);
		if (activeTab === "privacy") return (
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.privacyControls"))}
					<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, marginBottom: 8 }}>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0, marginBottom: 3 }}>{t("account.profileVisibility")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("account.profileVisibilityDesc")}</p>
						</div>
						<select
							value={profileVisibility === "friends" ? "private" : profileVisibility}
							onChange={e => {
								const value = e.target.value === "private" ? "private" : "public";
								const previous = profileVisibility === "friends" ? "private" : profileVisibility;
								setProfileVisibility(value);
								try { localStorage.setItem("strug_profile_visibility", value); } catch {}
								// Going public auto-accepts pending inbound follows server-side, so
								// refresh the inbox instead of leaving rows that now 404 on Accept.
								setProfilePrivate(value === "private")
									.then(() => { if (value !== "private") loadFollowRequests(); })
									.catch(() => {
										setProfileVisibility(previous);
										try { localStorage.setItem("strug_profile_visibility", previous); } catch {}
										setSaveMsg(t("account.failedSaveMsg"));
										setTimeout(() => setSaveMsg(""), 3000);
									});
							}}
							style={{ padding: "8px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }}
						>
							<option value="public">{t("account.visibilityPublic")}</option>
							<option value="private">{t("account.visibilityPrivate")}</option>
						</select>
					</div>
					{Object.entries(privacy).map(([key, val]) => {
						const live = key === "showOnlineStatus";
						const unavailableHint = t("account.privacyNotAvailableYet", {
							defaultValue: "Not available yet. This setting is not enforced in the product.",
						});
						return (
							<SettingRow
								key={key}
								label={privacyLabels[key]}
								desc={live ? privacyDescs[key] : `${privacyDescs[key]} ${unavailableHint}`}
							>
								<Toggle
									on={live ? val : false}
									disabled={!live}
									onToggle={() => {
										if (!live) return;
										setPrivacy((prev) => {
											const previous = !!prev[key];
											const next = { ...prev, [key]: !previous };
											try { localStorage.setItem("strug_privacy_prefs", JSON.stringify(next)); } catch {}
											updateSocialProfile({ show_activity_status: next[key] }).catch(() => {
												setPrivacy((cur) => {
													const rolled = { ...cur, [key]: previous };
													try { localStorage.setItem("strug_privacy_prefs", JSON.stringify(rolled)); } catch {}
													return rolled;
												});
												setSaveMsg(t("account.failedSaveMsg"));
												setTimeout(() => setSaveMsg(""), 3000);
											});
											return next;
										});
									}}
								/>
							</SettingRow>
						);
					})}
				</div>
				<div className={cardClassName} style={cardStyle}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
						<div>
							{cardTitle(t("account.followRequestsTitle", "Follow requests"))}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "-8px 0 0" }}>
								{t("account.followRequestsDesc", "People who asked to follow your private profile. Accept to let them see your posts.")}
							</p>
						</div>
						<button type="button" disabled={followRequestsLoading} onClick={loadFollowRequests} style={{ padding: "9px 13px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface-raised)", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: followRequestsLoading ? "default" : "pointer", flexShrink: 0 }}>
							{followRequestsLoading ? t("account.refreshing", "Refreshing...") : t("account.refresh", "Refresh")}
						</button>
					</div>
					{followRequestsError && <p role="alert" style={{ color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 10px" }}>{followRequestsError}</p>}
					{followRequestsLoading && !followRequests.length ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("account.followRequestsLoading", "Loading follow requests...")}</p>
					) : followRequests.length ? (
						<div style={{ display: "grid", gap: 8 }}>
							{followRequests.map((row) => {
								const account = row.requester || {};
								const pid = row.requester_profile_id;
								const busy = followRequestActionId === pid;
								return (
									<div key={pid} className="bg-surface-raised" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 12 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
											{account.profile_pic_url ? (
												<img src={account.profile_pic_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
											) : (
												<span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(37,99,235,0.18)", color: "#93c5fd", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, flexShrink: 0 }}>{String(account.display_name || account.handle || "?").charAt(0).toUpperCase()}</span>
											)}
											<div style={{ minWidth: 0 }}>
												<p className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.display_name || t("account.followRequestUnknown", "Follow request")}</p>
												<p className="text-text-secondary" style={{ margin: "2px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{account.handle ? `@${account.handle}` : ""}</p>
											</div>
										</div>
										<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
											<button type="button" disabled={busy} onClick={() => handleAcceptFollowRequest(row)} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
												{busy ? "…" : t("account.followRequestAccept", "Accept")}
											</button>
											<button type="button" disabled={busy} onClick={() => handleRejectFollowRequest(row)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface-raised)", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
												{t("account.followRequestDecline", "Decline")}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("account.followRequestsEmpty", "No pending follow requests.")}</p>
					)}
				</div>
				<div className={cardClassName} style={cardStyle}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
						<div>
							{cardTitle("Blocked accounts")}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "-8px 0 0" }}>
								People blocked on Strug cannot follow, message, match, invite, or interact with you.
							</p>
						</div>
						<button type="button" disabled={blockedAccountsLoading} onClick={loadBlockedAccounts} style={{ padding: "9px 13px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface-raised)", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: blockedAccountsLoading ? "default" : "pointer", flexShrink: 0 }}>
							{blockedAccountsLoading ? "Refreshing..." : "Refresh"}
						</button>
					</div>
					{blockedAccountsError && <p role="alert" style={{ color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 10px" }}>{blockedAccountsError}</p>}
					{blockedAccountsLoading && !blockedAccounts.length ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>Loading blocked accounts...</p>
					) : blockedAccounts.length ? (
						<div style={{ display: "grid", gap: 8 }}>
							{blockedAccounts.map((account) => (
								<div key={account.profile_id || account.block_id} className="bg-surface-raised" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 12 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
										{account.profile_pic_url ? (
											<img src={account.profile_pic_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
										) : (
											<span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(37,99,235,0.18)", color: "#93c5fd", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, flexShrink: 0 }}>{String(account.display_name || account.handle || "?").charAt(0).toUpperCase()}</span>
										)}
										<div style={{ minWidth: 0 }}>
											<p className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.display_name || "Blocked account"}</p>
											<p className="text-text-secondary" style={{ margin: "2px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{account.handle ? `@${account.handle}` : "Blocked across Strug"}</p>
										</div>
									</div>
									<button type="button" disabled={unblockingProfileId === account.profile_id} onClick={() => handleUnblockAccount(account)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.1)", color: "#fca5a5", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, cursor: unblockingProfileId === account.profile_id ? "default" : "pointer", flexShrink: 0 }}>
										{unblockingProfileId === account.profile_id ? "Unblocking..." : "Unblock"}
									</button>
								</div>
							))}
						</div>
					) : (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>No blocked accounts.</p>
					)}
				</div>
				{/* #492 — Friend video activity: share opt-in (default OFF) + rail visibility (default ON). */}
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.videoActivityTitle", { defaultValue: "Video activity" }))}
					<SettingRow
						label={t("account.shareVideoActivityLabel", { defaultValue: "Share my activity with friends" })}
						desc={t("account.shareVideoActivityDesc", { defaultValue: "Let people you mutually follow see videos you like and have watched in Your Circle. Live watching stays private. Off by default." })}
					>
						<Toggle on={videoActivity.share_video_activity} onToggle={() => toggleVideoActivity("share_video_activity")} />
					</SettingRow>
					<SettingRow
						label={t("account.showFriendActivityLabel", { defaultValue: "Show “Friends are watching”" })}
						desc={t("account.showFriendActivityDesc", { defaultValue: "Show a rail of videos your friends like or watch while you’re watching a video." })}
					>
						<Toggle on={videoActivity.show_friend_video_activity} onToggle={() => toggleVideoActivity("show_friend_video_activity")} />
					</SettingRow>
				</div>
				<div className={cardClassName} style={cardStyle}>

					{cardTitle("Cookie preferences")}
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 12px" }}>
						Essential cookies are always on. Optional analytics cookies can be turned off below (stored on this device).
					</p>
					<SettingRow label="Analytics cookies" desc="Help us understand product usage. Off = no analytics cookies from this browser.">
						<Toggle
							on={(() => { try { return localStorage.getItem("strug_cookie_analytics") !== "0"; } catch { return true; } })()}
							onToggle={() => {
								try {
									const on = localStorage.getItem("strug_cookie_analytics") !== "0";
									localStorage.setItem("strug_cookie_analytics", on ? "0" : "1");
								} catch { /* noop */ }
								setPrivacy((p) => ({ ...p })); // re-render
							}}
						/>
					</SettingRow>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.dataRights"))}
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
						{[{ label: t("account.downloadMyData"), desc: t("account.downloadMyDataDesc"), color: "#60a5fa", onClick: handleDownloadMyData }, { label: deletingAccount ? t("account.deleteAccountDeleting") : t("account.deleteAccount"), desc: t("account.deleteAccountDesc"), color: "#f87171", onClick: handleDeleteAccount, disabled: deletingAccount }].map(a => (
							<button className="bg-surface-raised border border-border-subtle" key={a.label} onClick={a.onClick} disabled={a.disabled} style={{ padding: "18px", borderRadius: 12, textAlign: "left", cursor: a.disabled ? "default" : "pointer", opacity: a.disabled ? 0.6 : 1 }}>
								<div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}18`, border: `1px solid ${a.color}30`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
									<div style={{ width: 14, height: 14, borderRadius: "50%", background: a.color, opacity: 0.85 }} />
								</div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 4 }}>{a.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{a.desc}</p>
							</button>
						))}
					</div>
				</div>
			{deleteDialog}
				</div>
		);
		if (activeTab === "language") return (
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.languageRegion"))}
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
						<div>
							<label className="text-text-secondary" id={`${uid}-language`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.language")}</label>
							<LanguageSelect
								value={selectedLang}
								onChange={(code) => setSelectedLang(code)}
								ariaLabelledBy={`${uid}-language`}
							/>
						</div>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-currency`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.currency")}</label>
							<select
								id={`${uid}-currency`}
								className="strug-native-select"
								style={selectStyle}
								value={selectedCurrency}
								onChange={e => {
									const code = e.target.value;
									setSelectedCurrency(code);
									const userId = getUser()?.user_id;
									if (userId) updateUser(userId, { currency: code }).catch(() => {});
								}}
							>
								{SETTINGS_CURRENCIES.map((code) => (
									<option key={code} value={code}>
										{t("account.currencyOption", {
											code,
											name: t(`account.currencies.${code}`),
										})}
									</option>
								))}
							</select>
						</div>
					</div>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t("account.dateTimeFormat")}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px" }}>
						{t("account.dateTimeNotAppliedYet", {
							defaultValue: "Saved on this device only for now. Messages, bookings, and other screens do not use these formats yet.",
						})}
					</p>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-date-format`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.dateFormat")}</label>
							<select
								id={`${uid}-date-format`}
								className="strug-native-select"
								style={selectStyle}
								value={dateFormat}
								onChange={e => {
									setDateFormat(e.target.value);
									try { localStorage.setItem("strug_date_format", e.target.value); } catch {}
								}}
							>
								{SETTINGS_DATE_FORMATS.map((key) => (
									<option key={key} value={key}>{t(`account.dateFormats.${key}`)}</option>
								))}
							</select>
						</div>
						<div>
							<label className="text-text-secondary" htmlFor={`${uid}-time-format`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>{t("account.timeFormat")}</label>
							<select
								id={`${uid}-time-format`}
								className="strug-native-select"
								style={selectStyle}
								value={timeFormat}
								onChange={e => {
									setTimeFormat(e.target.value);
									try { localStorage.setItem("strug_time_format", e.target.value); } catch {}
								}}
							>
								<option value="12">{t("account.timeFormat12")}</option>
								<option value="24">{t("account.timeFormat24")}</option>
							</select>
						</div>
					</div>
				</div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.timeZone"))}
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px" }}>
						{t("account.dateTimeNotAppliedYet", {
							defaultValue: "Saved on this device only for now. Messages, bookings, and other screens do not use these formats yet.",
						})}
					</p>
					<select
						aria-label={t("account.timeZone")}
						className="strug-native-select"
						style={selectStyle}
						value={timeZone}
						onChange={e => {
							setTimeZone(e.target.value);
							try { localStorage.setItem("strug_timezone", e.target.value); } catch {}
						}}
					>
						{SETTINGS_TIME_ZONES.map((key) => (
							<option key={key} value={key}>{t(`account.timeZones.${key}`)}</option>
						))}
					</select>
				</div>
			</div>
		);
		if (activeTab === "billing") return (<>
			<div>
				<div className={cardClassName} style={cardStyle}>
					{cardTitle(t("account.paymentMethods"))}
					{realPaymentMethods.length === 0 && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 12px" }}>{t("account.noSavedPaymentMethods")}</p>
					)}
					{realPaymentMethods.map((card, i) => (
						<div className="bg-surface-raised" key={card.id ?? i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, marginBottom: 8 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div className="bg-surface-raised border border-border" style={{ width: 46, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
								</div>
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0 }}>{(card.brand ?? card.type ?? "Card").toUpperCase()} •••• {card.last4}</p>
									{card.isDefault && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#60a5fa" }}>{t("account.defaultLabel")}</span>}
								</div>
							</div>
							<div style={{ display: "flex", gap: 12 }}>
								<button disabled={removingCardId === card.id} onClick={async () => {
									setRemovingCardId(card.id);
									try {
										await removePaymentMethod(card.id);
										setRealPaymentMethods(prev => prev.filter(m => m.id !== card.id));
									} catch (err) {
										setSaveMsg(apiMessage(err) || t("account.removePaymentFailed", { defaultValue: "Could not remove payment method." }));
										setTimeout(() => setSaveMsg(""), 4000);
									} finally {
										setRemovingCardId(null);
									}
								}} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: removingCardId === card.id ? "rgba(248,113,113,0.4)" : "#f87171", background: "none", border: "none", cursor: removingCardId === card.id ? "default" : "pointer" }}>{removingCardId === card.id ? t("account.removing") : t("account.remove")}</button>
							</div>
						</div>
					))}
					<button className="text-text-secondary bg-surface-raised" onClick={() => { setShowAddPaymentModal(true); setSettingsAddPaymentError(""); setSettingsAddPaymentDone(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "13px 16px", border: "2px dashed var(--color-border)", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer" }}>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
						Add Payment Method
					</button>
				</div>
			</div>
		{showAddPaymentModal && (
			// Backdrop scrim stays a fixed black overlay in both themes (modal-dimming convention).
			<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAddPaymentModal(false)}>
				<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: "32px", width: "min(440px, 90vw)" }} onClick={e => e.stopPropagation()}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{t("account.addPaymentMethod")}</h3>
						<button className="text-text-secondary" onClick={() => setShowAddPaymentModal(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>&#215;</button>
					</div>
					{settingsAddPaymentDone ? (
						<p style={{ color: "#34d399", fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center" }}>✓ {t("account.cardSavedSuccess")}</p>
					) : (
						<>
							{/* Kept permanently dark, like the CardElement box in Rideshare.jsx: Stripe's iframe
							    reads its text color from this JS options object, which can't resolve
							    var(--color-*) custom properties, so box + white text must stay a fixed
							    matched pair regardless of theme. */}
							<div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", padding: "12px 14px", borderRadius: 10, marginBottom: 16 }}>
								<CardElement options={{ style: { base: { color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", "::placeholder": { color: "rgba(255,255,255,0.35)" } } } }} />
							</div>
							{settingsAddPaymentError && <p style={{ color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{settingsAddPaymentError}</p>}
							<div style={{ display: "flex", gap: 10 }}>
								<button className="text-text-secondary bg-surface-raised border border-border" onClick={() => setShowAddPaymentModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>{t("common.cancel")}</button>
								<button onClick={handleSettingsAddPayment} disabled={settingsAddPaymentLoading || !settingsStripe} style={{ color: "#fff", flex: 1, padding: "11px", background: "#2563eb", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: settingsAddPaymentLoading ? "default" : "pointer", opacity: settingsAddPaymentLoading ? 0.7 : 1 }}>{settingsAddPaymentLoading ? t("account.savingCard") : t("account.saveCard")}</button>
							</div>
						</>
					)}
				</div>
			</div>
		)}
		</>);
		return null;
	}

	return (
		<div className="scroll-area" style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 24, overflowY: "auto" }}>
			{/* Hero */}
			<div className="border border-border" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, rgba(37,99,235,0.14) 0%, rgba(124,58,237,0.14) 50%, rgba(219,39,119,0.14) 100%)", borderRadius: 20, padding: isMobile ? "20px" : "28px 36px", marginBottom: 28, animation: "fadeUp 0.3s ease both" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
						<UserSettingsIcon s={26} />
					</div>
					<div>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,3vw,38px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, marginBottom: 4 }}>{t("account.settings")}</h1>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{t("account.settingsHeroDesc")}</p>
					</div>
				</div>
			</div>

			{/* Layout */}
			<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24, alignItems: "flex-start" }}>
				{/* Tab nav */}
				<div style={{ width: isMobile ? "100%" : 220, flexShrink: 0, position: isMobile ? "static" : "sticky", top: 20 }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "10px", display: isMobile ? "flex" : "block", gap: isMobile ? 4 : 0, overflowX: isMobile ? "auto" : "visible" }}>
						{tabs.map(tab => (
							<button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flexShrink: isMobile ? 0 : undefined, width: isMobile ? "auto" : "100%", display: "flex", alignItems: "center", padding: isMobile ? "9px 14px" : "11px 14px", borderRadius: 10, border: "none", background: activeTab === tab.id ? "rgba(37,99,235,0.18)" : "none", color: activeTab === tab.id ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left", transition: "all 0.15s", marginBottom: isMobile ? 0 : 3, whiteSpace: isMobile ? "nowrap" : "normal" }}>
								{tab.label}
							</button>
						))}
					</div>
				</div>

				{/* Content */}
				<div style={{ flex: 1, minWidth: 0 }}>
					{renderContent()}
					<div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 20 }}>
						{saveMsg && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: saveMsg === t("account.savedMsg") || saveMsg === t("account.downloadMyDataDone", { defaultValue: "Download started." }) || saveMsg === t("account.photoUpdatedMsg") ? "#4ade80" : "#f87171" }}>{saveMsg}</span>}
						{activeTab === "account" && (
							<button onClick={handleSaveProfile} disabled={saveLoading} style={{ color: "#fff", display: "flex", alignItems: "center", gap: 8, padding: "11px 24px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: saveLoading ? "default" : "pointer", opacity: saveLoading ? 0.7 : 1 }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/></svg>
								{saveLoading ? t("account.saving") : t("account.saveChanges")}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

const HELP_FAQ_KEYS = [
	{ q: "account.faqOrderQ", a: "account.faqOrderA", cats: ["account.helpOrdersPayments", "account.helpDeliveries", "account.helpRefunds"] },
	{ q: "account.faqTrackQ", a: "account.faqTrackA", cats: ["account.helpOrdersPayments", "account.helpDeliveries"] },
	{ q: "account.faqCancelQ", a: "account.faqCancelA", cats: ["account.helpOrdersPayments", "account.helpRefunds"] },
	{ q: "account.faqReferralQ", a: "account.faqReferralA", cats: ["account.accountSettings"] },
	{ q: "account.faqSellerQ", a: "account.faqSellerA", cats: ["account.helpSelling"] },
	{ q: "account.faqPaymentQ", a: "account.faqPaymentA", cats: ["account.helpOrdersPayments", "account.helpRefunds"] },
	{ q: "account.faqContactQ", a: "account.faqContactA", cats: ["account.accountSettings", "account.helpSafety"] },
	{ q: "account.faqAiQ", a: "account.faqAiA", cats: ["account.accountSettings"] },
];

const HELP_CAT_KEYS = [
	{ key: "account.helpOrdersPayments", icon: "🛒" },
	{ key: "account.accountSettings", icon: "⚙️" },
	{ key: "account.helpDeliveries", icon: "📦" },
	{ key: "account.helpSelling", icon: "🏪" },
	{ key: "account.helpSafety", icon: "🔒" },
	{ key: "account.helpRefunds", icon: "💬" },
];

function HelpCenterPage({ onNavigate }) {
	const { t } = useTranslation();
	const { isMobile } = useViewport();
	const [openIdx, setOpenIdx] = useState(null);
	const [query, setQuery] = useState("");
	const [selectedFaqCategory, setSelectedFaqCategory] = useState(null);
	const faqSectionRef = useRef(null);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [msg, setMsg] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const filtered = HELP_FAQ_KEYS.filter(f => {
		if (selectedFaqCategory && !(f.cats || []).includes(selectedFaqCategory)) return false;
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		return t(f.q).toLowerCase().includes(q) || t(f.a).toLowerCase().includes(q);
	});

	function selectHelpCategory(key) {
		setSelectedFaqCategory(prev => (prev === key ? null : key));
		setQuery("");
		setOpenIdx(null);
		requestAnimationFrame(() => {
			faqSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	}

	async function handleSupportSubmit() {
		if (!name.trim() || !email.trim() || !msg.trim() || submitting) return;
		setSubmitting(true);
		setSubmitError("");
		try {
			await openSupportChat({
				initialMessage: `Support request from ${name.trim()} (${email.trim()}):\n\n${msg.trim()}`,
			});
			setSubmitted(true);
			onNavigate?.("messages");
		} catch {
			setSubmitError(t("account.supportChatError"));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="scroll-area" style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingTop: 32, paddingBottom: 24 }}>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 38, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("account.helpCenter")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>{t("account.helpHeroDesc")}</p>
				{/* Search */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, display: "flex", alignItems: "center", padding: "14px 18px", gap: 12, marginBottom: 32 }}>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					<input className="text-text-primary" value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("account.searchHelp")} style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15, caretColor: "#2563eb" }} />
				</div>
				{/* Category shortcuts */}
				{!query && (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 36 }}>
						{HELP_CAT_KEYS.map(c => (
							<button key={c.key} type="button" onClick={() => selectHelpCategory(c.key)} style={{ background: selectedFaqCategory === c.key ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${selectedFaqCategory === c.key ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, borderRadius: 12, padding: "14px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color 0.15s, background 0.15s" }}
								onMouseEnter={e => { if (selectedFaqCategory !== c.key) { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; } }}
								onMouseLeave={e => { if (selectedFaqCategory !== c.key) { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; } }}>
								<span style={{ fontSize: 20 }}>{c.icon}</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{t(c.key)}</span>
							</button>
						))}
					</div>
				)}
				{/* FAQs */}
				<div ref={faqSectionRef} style={{ marginBottom: 48 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>{t("account.faqTitle")}</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{filtered.length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "20px 0" }}>{t("account.noResultsFor", { query })}</p>
						) : filtered.map((faq, i) => (
							<div className="bg-surface-raised" key={i} style={{ border: `1px solid ${openIdx === i ? "rgba(37,99,235,0.35)" : "var(--color-border)"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
								<button onClick={() => setOpenIdx(openIdx === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "none", border: "none", cursor: "pointer" }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, textAlign: "left" }}>{t(faq.q)}</span>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openIdx === i ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginLeft: 12 }}><polyline points="6 9 12 15 18 9"/></svg>
								</button>
								{openIdx === i && (
									<div style={{ padding: "0 18px 16px", borderTop: "1px solid var(--color-border-subtle)" }}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>{t(faq.a)}</p>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
				{/* Contact support */}
				<div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 18, padding: "28px" }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 6 }}>{t("account.stillNeedHelp")}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{t("account.supportDesc")}</p>
					{submitted ? (
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669" }}>{t("account.messageSent")}</p>
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
							<div style={{ display: "flex", gap: 14 }}>
								{[{ label: t("account.nameLabel"), val: name, set: setName, ph: t("account.namePlaceholder") }, { label: t("account.emailLabel"), val: email, set: setEmail, ph: t("account.emailPlaceholder") }].map(f => (
									<div key={f.label} style={{ flex: 1 }}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{f.label}</p>
										<input className="text-text-primary bg-surface-raised border border-border" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ width: "100%", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
									</div>
								))}
							</div>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{t("account.messageLabel")}</p>
								<textarea className="text-text-primary bg-surface-raised border border-border" value={msg} onChange={e => setMsg(e.target.value)} placeholder={t("account.describeIssue")} rows={4} style={{ width: "100%", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
							</div>
							<button onClick={handleSupportSubmit} disabled={submitting || !(name && email && msg)} style={{ alignSelf: "flex-start", background: (name && email && msg && !submitting) ? "#2563eb" : "var(--color-surface-raised)", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: (name && email && msg && !submitting) ? "#fff" : "var(--color-text-muted)", cursor: (name && email && msg && !submitting) ? "pointer" : "default", transition: "all 0.2s" }}>{submitting ? t("account.openingChat") : t("common.sendMessage")}</button>
							{submitError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 10 }}>{submitError}</p>}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { SavedRefCodesPage, WalletEarningsPage, UserDashboardPage, OrdersHistoryPage, UserSettingsPage, HelpCenterPage };
export { MessagesPage } from "./Messages.jsx";
