import React, { useEffect, useMemo, useState } from "react";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import {
	createPropertyInquiry,
	followProperty,
	unfollowProperty,
	saveProperty,
	unsaveProperty,
} from "../api/realestate";
import { isAuthenticated } from "../store/auth";

function money(n) {
	if (n == null || !Number.isFinite(Number(n))) return i18n.t("preconstruct.priceOnRequest");
	return `$${Number(n).toLocaleString()}`;
}

/** Only allow http(s) hrefs from builder-editable free text. */
export function safeHttpUrl(raw) {
	if (!raw || typeof raw !== "string") return null;
	const trimmed = raw.trim();
	try {
		const u = new URL(trimmed);
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		return u.href;
	} catch {
		return null;
	}
}

function sectionHead(label, isMobile) {
	return (
		<p className="text-text-primary" style={{
			fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
			fontSize: isMobile ? 16 : 20, letterSpacing: "0.06em",
			textTransform: "uppercase", marginBottom: 16,
		}}>{label}</p>
	);
}

function emptyState(text) {
	return (
		<p className="text-text-muted" style={{
			fontFamily: "'DM Sans', sans-serif", fontSize: 13,
			margin: 0, lineHeight: 1.5,
		}}>{text}</p>
	);
}

function chip(label, active, onClick) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				padding: "7px 12px", borderRadius: 999,
				border: active ? "1px solid rgba(37,99,235,0.55)" : "1px solid var(--color-border)",
				background: active ? "rgba(37,99,235,0.18)" : "var(--color-surface-raised)",
				color: active ? "#93c5fd" : "var(--color-text-secondary)",
				fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
				cursor: "pointer", whiteSpace: "nowrap",
			}}
		>
			{label}
		</button>
	);
}

/** Follow / Save + virtual tour row */
export function CommunityActionBar({
	project, isFollowing, isSaved, onFollowChange, onSaveChange, followerCount,
}) {
	const { isMobile } = useViewport();
	const [busy, setBusy] = useState(null);
	const [err, setErr] = useState(null);
	const [localFollowers, setLocalFollowers] = useState(followerCount);

	useEffect(() => {
		setLocalFollowers(followerCount);
	}, [followerCount]);

	async function toggleFollow() {
		if (!isAuthenticated()) { setErr(i18n.t("preconstruct.logInToFollow")); return; }
		if (!project?.id) return;
		setBusy("follow"); setErr(null);
		try {
			if (isFollowing) await unfollowProperty(project.id);
			else await followProperty(project.id);
			onFollowChange?.(!isFollowing);
			setLocalFollowers((c) => {
				if (c == null || !Number.isFinite(Number(c))) return c;
				return Math.max(0, Number(c) + (isFollowing ? -1 : 1));
			});
		} catch {
			setErr(i18n.t("preconstruct.followUpdateFailed"));
		} finally {
			setBusy(null);
		}
	}

	async function toggleSave() {
		if (!isAuthenticated()) { setErr(i18n.t("preconstruct.logInToSave")); return; }
		if (!project?.id) return;
		setBusy("save"); setErr(null);
		try {
			if (isSaved) await unsaveProperty(project.id);
			else await saveProperty(project.id);
			onSaveChange?.(!isSaved);
		} catch {
			setErr(i18n.t("preconstruct.saveUpdateFailed"));
		} finally {
			setBusy(null);
		}
	}

	const tourUrl = safeHttpUrl(project?.virtual_tour_url);

	return (
		<div style={{
			display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
			marginBottom: 20,
		}}>
			<button
				type="button"
				onClick={toggleFollow}
				disabled={busy === "follow"}
				style={{
					padding: "10px 16px", borderRadius: 10, cursor: "pointer",
					border: isFollowing ? "1px solid rgba(5,150,105,0.45)" : "1px solid var(--color-border)",
					background: isFollowing ? "rgba(5,150,105,0.15)" : "var(--color-surface-raised)",
					// Fixed white text was previously paired with a neutral (theme-flipping) background —
					// invisible in light mode when not following. Follow it accordingly.
					color: isFollowing ? "#34d399" : "var(--color-text-primary)",
					fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13,
				}}
			>
				{isFollowing ? i18n.t("preconstruct.followingUpdates") : i18n.t("preconstruct.followCommunity")}
				{localFollowers != null ? ` · ${localFollowers}` : ""}
			</button>
			<button
				type="button"
				onClick={toggleSave}
				disabled={busy === "save"}
				style={{
					padding: "10px 16px", borderRadius: 10, cursor: "pointer",
					border: isSaved ? "1px solid rgba(245,158,11,0.45)" : "1px solid var(--color-border)",
					background: isSaved ? "rgba(245,158,11,0.15)" : "var(--color-surface-raised)",
					// Same fixed-white-on-conditional-bg fix as the Follow button above.
					color: isSaved ? "#fbbf24" : "var(--color-text-primary)",
					fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: isMobile ? 12 : 13,
				}}
			>
				{isSaved ? i18n.t("preconstruct.saved") : i18n.t("preconstruct.save")}
			</button>
			{tourUrl && (
				<a
					href={tourUrl}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						padding: "10px 16px", borderRadius: 10, textDecoration: "none",
						border: "1px solid rgba(124,58,237,0.4)", background: "rgba(124,58,237,0.15)",
						color: "#c4b5fd", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
						fontSize: isMobile ? 12 : 13,
					}}
				>
					{i18n.t("preconstruct.virtualTour")}
				</a>
			)}
			{err && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171" }}>{err}</span>}
		</div>
	);
}

export function CurrentIncentivesSection({ project, onClaim, initiallyClaimedKeys = [] }) {
	const { isMobile } = useViewport();
	const incentives = useMemo(() => {
		return Array.isArray(project.incentives) ? project.incentives.filter(Boolean) : [];
	}, [project.incentives]);
	const [claimedKeys, setClaimedKeys] = useState(() => new Set(initiallyClaimedKeys));
	const [claimingKey, setClaimingKey] = useState(null);

	useEffect(() => {
		if (!initiallyClaimedKeys?.length) return;
		setClaimedKeys((prev) => {
			const next = new Set(prev);
			initiallyClaimedKeys.forEach((k) => next.add(k));
			return next;
		});
	}, [initiallyClaimedKeys]);

	function incentiveKey(inc) {
		return String(inc.id || inc.title || "").trim();
	}

	async function handleClaim(inc) {
		const key = incentiveKey(inc);
		if (!key || claimedKeys.has(key) || claimingKey) return;
		setClaimingKey(key);
		try {
			const ok = await onClaim?.(inc);
			if (ok !== false) {
				setClaimedKeys((prev) => new Set(prev).add(key));
			}
		} finally {
			setClaimingKey(null);
		}
	}

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.currentIncentives"), isMobile)}
			{!incentives.length ? emptyState(i18n.t("preconstruct.noCurrentIncentives")) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{incentives.map((inc, i) => {
					const baseKey = incentiveKey(inc);
					const key = baseKey ? `${baseKey}::${i}` : `incentive-${i}`;
					const claimed = (baseKey && claimedKeys.has(baseKey)) || claimedKeys.has(inc.title);
					const busy = claimingKey === baseKey;
					return (
					<div
						key={key}
						style={{
							background: "linear-gradient(135deg, rgba(37,99,235,0.12), var(--color-surface-raised))",
							border: "1px solid rgba(37,99,235,0.25)",
							borderRadius: 14, padding: isMobile ? "14px 16px" : "16px 20px",
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 15, margin: 0 }}>
								{inc.title}
							</p>
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								{inc.badge && (
									<span style={{
										fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
										color: "#93c5fd", background: "rgba(37,99,235,0.2)", borderRadius: 6, padding: "3px 8px",
										fontFamily: "'DM Sans', sans-serif",
									}}>{inc.badge}</span>
								)}
								{inc.expires && (
									<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{inc.expires}</span>
								)}
							</div>
						</div>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, lineHeight: 1.6, margin: "0 0 12px" }}>
							{inc.detail || inc.description}
						</p>
						{claimed ? (
							<span style={{
								display: "inline-flex", alignItems: "center", gap: 6,
								fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#34d399",
							}}>
								<span style={{ fontWeight: 800 }}>{"\u2713"}</span>
								{i18n.t("preconstruct.offerClaimed")}
							</span>
						) : (
							<button
								type="button"
								disabled={busy}
								onClick={() => handleClaim(inc)}
								style={{
									background: busy ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 9, padding: "8px 14px",
									color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12,
									cursor: busy ? "default" : "pointer",
								}}
							>
								{busy ? i18n.t("preconstruct.claiming") : i18n.t("preconstruct.claimOffer")}
							</button>
						)}
					</div>
					);
				})}
			</div>
			)}
		</div>
	);
}

export function AmenitiesSection({ project }) {
	const { isMobile } = useViewport();
	const amenities = useMemo(() => {
		return Array.isArray(project.amenities) ? project.amenities.filter(Boolean) : [];
	}, [project.amenities]);

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.communityAmenities"), isMobile)}
			{!amenities.length ? emptyState(i18n.t("preconstruct.noAmenitiesListed")) : (
			<div style={{
				display: "grid",
				gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
				gap: 10,
			}}>
				{amenities.map((a, i) => (
					<div
						key={typeof a === "string" ? `${a}-${i}` : `${a?.name || "amenity"}-${i}`}
						className="bg-surface-raised border border-border"
						style={{
							borderRadius: 12, padding: "12px 14px",
						}}
					>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, margin: 0, fontWeight: 600 }}>
							{typeof a === "string" ? a : a.name}
						</p>
					</div>
				))}
			</div>
			)}
		</div>
	);
}

export function QuickMoveInSection({ project, onReserve, initiallyReservedKeys = [] }) {
	const { isMobile } = useViewport();
	const homes = useMemo(() => {
		return Array.isArray(project.move_in_homes) ? project.move_in_homes.filter(Boolean) : [];
	}, [project.move_in_homes]);
	const [reservedKeys, setReservedKeys] = useState(() => new Set(initiallyReservedKeys));
	const [reservingKey, setReservingKey] = useState(null);

	useEffect(() => {
		if (!initiallyReservedKeys?.length) return;
		setReservedKeys((prev) => {
			const next = new Set(prev);
			initiallyReservedKeys.forEach((k) => next.add(k));
			return next;
		});
	}, [initiallyReservedKeys]);

	function homeKey(h) {
		return String(h.id || h.address || h.name || "").trim();
	}

	async function handleReserve(home) {
		const key = homeKey(home);
		if (!key || reservedKeys.has(key) || reservingKey) return;
		setReservingKey(key);
		try {
			const ok = await onReserve?.(home);
			if (ok !== false) setReservedKeys((prev) => new Set(prev).add(key));
		} finally {
			setReservingKey(null);
		}
	}

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.quickMoveInHomes"), isMobile)}
			{!homes.length ? emptyState(i18n.t("preconstruct.noMoveInHomes")) : (
			<>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: -8, marginBottom: 14 }}>
				{i18n.t("preconstruct.readyNearReadyInventory")}
			</p>
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{homes.map((h, i) => {
					const baseKey = homeKey(h);
					const key = baseKey ? `${baseKey}::${i}` : `home-${i}`;
					const reserved = (baseKey && reservedKeys.has(baseKey)) || reservedKeys.has(h.address) || reservedKeys.has(h.name);
					const busy = reservingKey === baseKey;
					return (
					<div
						key={key}
						className="bg-surface-raised border border-border"
						style={{
							display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
							justifyContent: "space-between",
							borderRadius: 14, padding: "14px 16px",
						}}
					>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{h.address || h.name || i18n.t("preconstruct.homeN", { n: i + 1 })}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "4px 0 0" }}>
								{h.beds} {i18n.t("preconstruct.bed")} · {h.baths} {i18n.t("preconstruct.bath")} · {h.sqft?.toLocaleString?.() || h.sqft} {i18n.t("preconstruct.sqft")}
								{h.eta ? ` · ${h.eta}` : ""}
							</p>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<div style={{ textAlign: "right" }}>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa", margin: 0 }}>{money(h.price)}</p>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: h.status === "Ready" ? "#34d399" : "#fbbf24", margin: "3px 0 0" }}>{h.status || i18n.t("preconstruct.available")}</p>
							</div>
							{reserved ? (
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#34d399" }}>{i18n.t("preconstruct.reserved")}</span>
							) : (
								<button
									type="button"
									disabled={busy}
									onClick={() => handleReserve(h)}
									style={{
										background: busy ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 9, padding: "9px 14px",
										color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12,
										cursor: busy ? "default" : "pointer",
									}}
								>
									{busy ? i18n.t("common.sending") : i18n.t("preconstruct.reserve")}
								</button>
							)}
						</div>
					</div>
					);
				})}
			</div>
			</>
			)}
		</div>
	);
}

export function DesignStudioSection({ project, onRequestPackage, initiallyRequestedKeys = [] }) {
	const { isMobile } = useViewport();
	const packages = useMemo(() => {
		return Array.isArray(project.design_packages) ? project.design_packages.filter(Boolean) : [];
	}, [project.design_packages]);
	const [selected, setSelected] = useState(packages[0]?.id || packages[0]?.name);
	const [requestedKeys, setRequestedKeys] = useState(() => new Set(initiallyRequestedKeys));
	const [requesting, setRequesting] = useState(false);

	useEffect(() => {
		if (!packages.length) return;
		const stillValid = packages.some((p) => (p.id || p.name) === selected);
		if (!stillValid) setSelected(packages[0]?.id || packages[0]?.name);
	}, [packages, selected]);

	useEffect(() => {
		if (!initiallyRequestedKeys?.length) return;
		setRequestedKeys((prev) => {
			const next = new Set(prev);
			initiallyRequestedKeys.forEach((k) => next.add(k));
			return next;
		});
	}, [initiallyRequestedKeys]);

	const active = packages.find((p) => (p.id || p.name) === selected) || packages[0];
	const activeKey = active ? String(active.id || active.name || "") : "";
	const alreadyRequested = activeKey && (requestedKeys.has(activeKey) || requestedKeys.has(active?.name));

	async function handleRequest() {
		if (!active || alreadyRequested || requesting) return;
		setRequesting(true);
		try {
			const ok = await onRequestPackage?.(active);
			if (ok !== false) setRequestedKeys((prev) => new Set(prev).add(activeKey));
		} finally {
			setRequesting(false);
		}
	}

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.designStudio"), isMobile)}
			{!packages.length ? emptyState(i18n.t("preconstruct.noDesignPackages")) : (
			<>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: -8, marginBottom: 14 }}>
				{i18n.t("preconstruct.designStudioHint")}
			</p>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
				{packages.map((p, i) => chip(p.name, (p.id || p.name) === selected, () => setSelected(p.id || p.name || i)))}
			</div>
			{active && (
				<div className="bg-surface-raised border border-border" style={{
					borderRadius: 16, padding: isMobile ? 16 : 22,
				}}>
					<div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>{active.name}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "4px 0 0" }}>{active.tagline || active.description}</p>
						</div>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: active.price_delta ? "#fbbf24" : "#34d399", margin: 0 }}>
							{active.price_delta ? `+${money(active.price_delta)}` : i18n.t("preconstruct.included")}
						</p>
					</div>
					<div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
						{/* Swatch fill is host-entered design-package data (actual finish colors), not
						    a themed surface — stays as literal data color; only the neutral ring around
						    it follows the theme. */}
						{(Array.isArray(active.swatches) ? active.swatches : ["#d6d3d1", "#a8a29e", "#57534e"]).map((c) => (
							<div key={c} title={c} style={{ width: 36, height: 36, borderRadius: 10, background: c, border: "2px solid var(--color-border)" }} />
						))}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 16 }}>
						{(Array.isArray(active.includes) ? active.includes : []).map((item) => (
							<p key={item} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
								<span style={{ color: "#34d399", fontWeight: 800 }}>{"\u2713"}</span>
								<span>{item}</span>
							</p>
						))}
					</div>
					{alreadyRequested ? (
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#34d399", display: "inline-flex", alignItems: "center", gap: 6 }}>
							<span style={{ fontWeight: 800 }}>{"\u2713"}</span>
							{i18n.t("preconstruct.packageQuoteRequested", { name: active.name })}
						</span>
					) : (
						<button
							type="button"
							disabled={requesting}
							onClick={handleRequest}
							style={{
								background: requesting ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 10, padding: "11px 18px",
								color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13,
								cursor: requesting ? "default" : "pointer",
							}}
						>
							{requesting ? i18n.t("common.sending") : i18n.t("preconstruct.requestPackageQuote", { name: active.name })}
						</button>
					)}
				</div>
			)}
			</>
			)}
		</div>
	);
}

export function FloorPlanCompareBar({ floorPlans, compareIds, setCompareIds, onOpenCompare }) {
	const { isMobile } = useViewport();
	if (!floorPlans?.length) return null;

	function toggle(id) {
		if (id == null) return;
		setCompareIds((prev) => {
			if (prev.includes(id)) return prev.filter((x) => x !== id);
			if (prev.length >= 3) return prev;
			return [...prev, id];
		});
	}

	const needMore = compareIds.length < 2;
	const hint = floorPlans.length < 2
		? i18n.t("preconstruct.compareNeedTwoPlans")
		: needMore
			? i18n.t("preconstruct.compareTapMore", { count: 2 - compareIds.length })
			: i18n.t("preconstruct.compareReady");

	return (
		<div style={{
			marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
			justifyContent: "space-between",
			background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)",
			borderRadius: 12, padding: "12px 14px",
		}}>
			<div style={{ flex: 1, minWidth: 200 }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>
					{i18n.t("preconstruct.compareFloorPlans")}
				</p>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: needMore ? "#fbbf24" : "#34d399", margin: "3px 0 0" }}>
					{hint}
				</p>
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
					{floorPlans.map((fp) => chip(
						fp.label || fp.name || i18n.t("preconstruct.plan"),
						compareIds.includes(fp.id),
						() => toggle(fp.id),
					))}
				</div>
			</div>
			<button
				type="button"
				disabled={compareIds.length < 2}
				onClick={onOpenCompare}
				style={{
					padding: "10px 16px", borderRadius: 10, border: "none",
					background: compareIds.length >= 2 ? "#2563eb" : "var(--color-surface-raised)",
					// Disabled-state text was fixed white over a neutral bg that flips light in
					// light theme — same fixed-white-on-conditional-bg bug as CommunityActionBar.
					color: compareIds.length >= 2 ? "#fff" : "var(--color-text-muted)",
					fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13,
					cursor: compareIds.length >= 2 ? "pointer" : "default",
					flexShrink: 0,
				}}
			>
				{i18n.t("preconstruct.compareCount", { count: compareIds.length })}
			</button>
		</div>
	);
}

function parseSqftSortValue(sqft) {
	if (sqft == null) return null;
	if (typeof sqft === "number" && Number.isFinite(sqft)) return sqft;
	const nums = String(sqft).match(/[\d,]+(\.\d+)?/g);
	if (!nums?.length) return null;
	const first = Number(String(nums[0]).replace(/,/g, ""));
	return Number.isFinite(first) && first > 1 ? first : null;
}

function formatBeds(beds) {
	if (beds == null) return "-";
	if (Number(beds) === 0) return i18n.t("preconstruct.studio");
	return `${beds}`;
}

function valuesDiffer(values) {
	const normalized = values.map((v) => String(v ?? "").trim().toLowerCase());
	return new Set(normalized).size > 1;
}

export function FloorPlanCompareModal({ open, onClose, plans }) {
	const { isMobile } = useViewport();

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => {
			if (e.key === "Escape") onClose?.();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open || !plans?.length) return null;

	const cols = plans.length;
	const bedVals = plans.map((p) => Number(p.beds) || 0);
	const bathVals = plans.map((p) => Number(p.baths) || 0);
	const sqftVals = plans.map((p) => parseSqftSortValue(p.sqft));
	const maxBeds = Math.max(...bedVals);
	const maxBaths = Math.max(...bathVals);
	const maxSqft = Math.max(...sqftVals.filter((n) => n != null), 0);

	const rows = [
		{
			label: i18n.t("preconstruct.bedrooms"),
			values: plans.map((p) => formatBeds(p.beds)),
			highlight: (i) => bedVals[i] === maxBeds && valuesDiffer(bedVals),
			badge: (i) => (bedVals[i] === maxBeds && valuesDiffer(bedVals) ? i18n.t("preconstruct.mostBeds") : null),
		},
		{
			label: i18n.t("preconstruct.bathrooms"),
			values: plans.map((p) => (p.baths != null ? String(p.baths) : "-")),
			highlight: (i) => bathVals[i] === maxBaths && valuesDiffer(bathVals),
			badge: (i) => (bathVals[i] === maxBaths && valuesDiffer(bathVals) ? i18n.t("preconstruct.mostBaths") : null),
		},
		{
			label: i18n.t("preconstruct.size"),
			values: plans.map((p) => {
				const n = parseSqftSortValue(p.sqft);
				if (n == null && (!p.sqft || String(p.sqft).includes("TBD") || String(p.sqft) === "1 sq ft")) return i18n.t("preconstruct.sizeTbd");
				return p.sqft || i18n.t("preconstruct.sizeTbd");
			}),
			highlight: (i) => sqftVals[i] != null && sqftVals[i] === maxSqft && valuesDiffer(sqftVals),
			badge: (i) => (sqftVals[i] != null && sqftVals[i] === maxSqft && valuesDiffer(sqftVals) ? i18n.t("preconstruct.largest") : null),
		},
		{
			label: i18n.t("preconstruct.price"),
			values: plans.map((p) => p.price || i18n.t("preconstruct.priceOnRequest")),
			highlight: () => false,
			badge: () => null,
		},
		{
			label: i18n.t("preconstruct.availability"),
			values: plans.map((p) => (p.available ? i18n.t("preconstruct.available") : i18n.t("preconstruct.soldOut"))),
			highlight: (i) => !!plans[i].available && plans.some((p) => !p.available),
			badge: () => null,
		},
		{
			label: i18n.t("preconstruct.notes"),
			values: plans.map((p) => p.description || (p._sample ? i18n.t("preconstruct.sampleSuiteCompare") : "-")),
			highlight: () => false,
			badge: () => null,
		},
	];

	const gridCols = isMobile
		? `110px repeat(${cols}, minmax(140px, 1fr))`
		: `140px repeat(${cols}, minmax(160px, 1fr))`;

	return (
		<div
			// The fixed-overlay scrim stays dark in both themes — it's dimming the page behind
			// a modal, same reasoning as Preconstruct.jsx's floor plan lightbox backdrop.
			style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
			onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
		>
			<div className="bg-surface-raised border border-border" style={{
				borderRadius: 18,
				padding: isMobile ? 14 : 22, width: "100%", maxWidth: Math.min(420 + cols * 220, 1100),
				maxHeight: "92vh", overflow: "auto",
			}}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
					<div>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 20 : 24, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
							{i18n.t("preconstruct.floorPlanCompare")}
						</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "4px 0 0" }}>
							{i18n.t("preconstruct.floorPlanCompareHint")}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label={i18n.t("common.close")}
						className="bg-surface-raised border border-border text-text-primary"
						style={{
							borderRadius: 10, cursor: "pointer",
							width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 0, marginBottom: 8, alignItems: "end" }}>
					<div />
					{plans.map((fp) => (
						<div key={`img-${fp.id}`} style={{ padding: "0 6px 8px" }}>
							{/* White surface + fixed slate placeholder colors keep floor plan renders
							    (often transparent-background blueprints) visually consistent regardless
							    of theme — same reasoning as Preconstruct.jsx's floor plan lightbox. */}
							<div style={{
								height: isMobile ? 110 : 140, borderRadius: 12, background: "#fff",
								display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
								border: "1px solid rgba(255,255,255,0.1)",
							}}>
								{(fp.image_url || fp.original_image_url) ? (
									<img src={fp.image_url || fp.original_image_url} alt={fp.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }} />
								) : (
									<div style={{ textAlign: "center", padding: 8 }}>
										<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<rect x="2" y="2" width="20" height="20" rx="2" />
											<path d="M7 7h3v3H7z" /><path d="M14 7h3" /><path d="M14 12h3" /><path d="M7 14h10" />
										</svg>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>{i18n.t("preconstruct.floorPlanImagePending")}</p>
									</div>
								)}
							</div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: isMobile ? 13 : 15, margin: "10px 0 0", textAlign: "center" }}>
								{fp.label}
							</p>
							{fp._sample && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#fbbf24", margin: "2px 0 0", textAlign: "center" }}>{i18n.t("preconstruct.sampleSuite")}</p>
							)}
						</div>
					))}
				</div>

				<div className="border border-border" style={{ borderRadius: 14, overflow: "hidden" }}>
					{rows.map((row, rowIdx) => {
						const differs = valuesDiffer(row.values);
						return (
							<div
								key={row.label}
								style={{
									display: "grid",
									gridTemplateColumns: gridCols,
									background: rowIdx % 2 === 0 ? "var(--color-bg)" : "transparent",
									borderTop: rowIdx === 0 ? "none" : "1px solid var(--color-border-subtle)",
								}}
							>
								<div className="text-text-muted" style={{
									padding: isMobile ? "12px 10px" : "14px 14px",
									fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
									display: "flex", alignItems: "center",
									borderRight: "1px solid var(--color-border-subtle)",
								}}>
									{row.label}
									{differs && <span style={{ marginLeft: 6, fontSize: 9, color: "#60a5fa", fontWeight: 800 }}>{i18n.t("preconstruct.diff")}</span>}
								</div>
								{row.values.map((val, i) => {
									const hot = row.highlight(i);
									const badge = row.badge(i);
									return (
										<div
											key={`${row.label}-${i}`}
											style={{
												padding: isMobile ? "12px 10px" : "14px 12px",
												textAlign: "center",
												background: hot ? "rgba(37,99,235,0.18)" : "transparent",
												borderLeft: i === 0 ? "none" : "1px solid var(--color-border-subtle)",
											}}
										>
											<p style={{
												fontFamily: "'DM Sans', sans-serif",
												fontWeight: hot ? 800 : 600,
												fontSize: isMobile ? 13 : 14,
												color: row.label === i18n.t("preconstruct.availability")
													? (String(val).toLowerCase() === i18n.t("preconstruct.available").toLowerCase() ? "#34d399" : "#f87171")
													: row.label === i18n.t("preconstruct.price") ? "#60a5fa" : "var(--color-text-primary)",
												margin: 0,
												lineHeight: 1.35,
											}}>
												{val}
											</p>
											{badge && (
												<span style={{
													display: "inline-block", marginTop: 6, fontSize: 9, fontWeight: 800,
													letterSpacing: "0.04em", textTransform: "uppercase",
													color: "#93c5fd", background: "rgba(37,99,235,0.25)",
													borderRadius: 999, padding: "2px 7px",
													fontFamily: "'DM Sans', sans-serif",
												}}>
													{badge}
												</span>
											)}
										</div>
									);
								})}
							</div>
						);
					})}
				</div>

				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "12px 0 0", textAlign: "center" }}>
					{i18n.t("preconstruct.compareTip")}
				</p>
			</div>
		</div>
	);
}

export function SalesCenterSection({ project }) {
	const { isMobile } = useViewport();
	const hasAny = project.sales_center_address || project.sales_center_phone || project.sales_center_email || project.sales_center_hours;
	if (!hasAny) {
		return (
			<div style={{ marginBottom: 32 }}>
				{sectionHead(i18n.t("preconstruct.salesCenter"), isMobile)}
				{emptyState(i18n.t("preconstruct.noSalesCenterInfo"))}
			</div>
		);
	}

	const hours = typeof project.sales_center_hours === "string"
		? project.sales_center_hours
		: Array.isArray(project.sales_center_hours)
			? project.sales_center_hours.join(" · ")
			: project.sales_center_hours
				? JSON.stringify(project.sales_center_hours)
				: null;

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.salesCenter"), isMobile)}
			<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "16px 18px" }}>
				{project.sales_center_address && (
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 8px", fontWeight: 600 }}>{project.sales_center_address}</p>
				)}
				{project.sales_center_phone && (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 4px" }}>{project.sales_center_phone}</p>
				)}
				{project.sales_center_email && (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 4px" }}>{project.sales_center_email}</p>
				)}
				{hours && (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "8px 0 0" }}>{hours}</p>
				)}
			</div>
		</div>
	);
}

export function ConstructionUpdatesSection({ project }) {
	const { isMobile } = useViewport();
	const updates = Array.isArray(project.updates) ? project.updates : [];

	return (
		<div style={{ marginBottom: 32 }}>
			{sectionHead(i18n.t("preconstruct.constructionUpdates"), isMobile)}
			{!updates.length ? emptyState(i18n.t("preconstruct.noConstructionUpdates")) : (
			<div style={{ position: "relative", paddingLeft: 18 }}>
				<div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 2, background: "rgba(37,99,235,0.35)" }} />
				{updates.map((u, i) => (
					<div key={u.update_id || `update-${i}`} style={{ position: "relative", marginBottom: 16, paddingLeft: 14 }}>
						<div style={{ position: "absolute", left: -18, top: 4, width: 10, height: 10, borderRadius: "50%", background: "#2563eb", border: "2px solid var(--color-surface)" }} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{u.title}</p>
						{u.created_at && (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "3px 0 6px" }}>
								{String(u.created_at).slice(0, 10)}
							</p>
						)}
						{u.body && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{u.body}</p>
						)}
					</div>
				))}
			</div>
			)}
		</div>
	);
}

/** Stable token in the message body so claim dedupe does not parse buyer-facing prose. */
const SPECIALTY_ITEM_KEY_PREFIX = "__key__=";

export function encodeSpecialtyMessage(itemKey, message) {
	const text = message == null ? "" : String(message);
	if (itemKey == null || itemKey === "") return text;
	return `${SPECIALTY_ITEM_KEY_PREFIX}${encodeURIComponent(String(itemKey))}\n${text}`.trim();
}

export function extractSpecialtyItemKey(message) {
	const text = String(message || "");
	const m = text.match(/^__key__=([^\n]+)/);
	if (!m?.[1]) return null;
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return m[1];
	}
}

/** Strip machine token before showing the message in the builder lead inbox. */
export function stripSpecialtyItemKey(message) {
	const text = String(message || "");
	if (!text.startsWith(SPECIALTY_ITEM_KEY_PREFIX)) return text;
	const nl = text.indexOf("\n");
	return nl >= 0 ? text.slice(nl + 1).trim() : "";
}

export function specialtyKeysFromMessages(messages = []) {
	const keys = [];
	for (const msg of messages) {
		const key = extractSpecialtyItemKey(msg);
		if (key) keys.push(key);
	}
	return keys;
}

/** Helper used by detail page to post incentive / package / move-in interest */
export async function sendSpecialtyInterest(projectId, message, type = "interest", itemKey = null) {
	if (!isAuthenticated()) throw new Error("auth");
	await createPropertyInquiry(projectId, {
		type,
		message: encodeSpecialtyMessage(itemKey, message),
	});
}
