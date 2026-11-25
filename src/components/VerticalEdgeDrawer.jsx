import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlideOutEdgeTab, SlideOutPanel } from "./SlideOutPanel.jsx";
import { useViewport } from "../hooks/useViewport.js";
import { getAuthUserId, isAuthenticated } from "../store/auth.js";
import {
	getEdgeDrawerTabs,
	shouldShowVerticalEdgeDrawer,
	stackEdgeTabTop,
	edgeTabHeightPx,
} from "../utils/verticalEdgeDrawerConfig.js";
import { loadEdgeDrawerTabData, applyDrawerItemHandoff } from "../utils/verticalEdgeDrawerData.js";
import {
	hasSocialVault,
	isSocialVaultUnlocked,
	lockSocialVault,
	setupSocialVault,
	unlockSocialVault,
} from "../utils/socialVault.js";
import {
	markEdgeDrawerTabSeen,
	probeEdgeDrawerActivities,
	shouldGlowEdgeTab,
} from "../utils/edgeDrawerActivity.js";

/**
 * The edge-tab label is rotated vertical-rl text, so its block-direction (vertical) extent equals
 * the *horizontal* width the same run would take laid out normally. Measuring that in an offscreen
 * DOM span — rather than guessing a per-character size or measuring via <canvas> — always agrees
 * with whatever font actually rendered the visible label (canvas can under-measure if the 'DM Sans'
 * web font hasn't finished loading into that context yet, clipping the last letter or two).
 */
function useMeasuredEdgeLabelPx(labels, isMobile, active) {
	const containerRef = useRef(null);
	const lastPxRef = useRef(null);
	const [measuredPx, setMeasuredPx] = useState(null);

	useLayoutEffect(() => {
		const commit = (value) => {
			if (lastPxRef.current === value) return;
			lastPxRef.current = value;
			setMeasuredPx(value);
		};

		if (!active || !labels.length) {
			commit(null);
			return undefined;
		}
		let cancelled = false;
		const measure = () => {
			if (cancelled) return;
			const container = containerRef.current;
			if (!container) return;
			let max = 0;
			container.querySelectorAll("span").forEach((el) => {
				max = Math.max(max, el.getBoundingClientRect().width);
			});
			if (max > 0) commit(Math.ceil(max));
		};
		measure();
		if (typeof document !== "undefined" && document.fonts?.ready) {
			document.fonts.ready.then(measure).catch(() => {});
		}
		return () => {
			cancelled = true;
		};
	}, [active, labels, isMobile]);

	const measurer = active && labels.length ? (
		<div
			ref={containerRef}
			aria-hidden="true"
			style={{ position: "fixed", top: -9999, left: -9999, visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap" }}
		>
			{labels.map((label, i) => (
				<span
					key={i}
					style={{
						display: "block",
						fontFamily: "'DM Sans', sans-serif",
						fontWeight: 700,
						fontSize: isMobile ? 10 : 11,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
					}}
				>
					{label}
				</span>
			))}
		</div>
	) : null;

	return [measuredPx, measurer];
}

function DrawerLinkRow({ item, onNavigate }) {
	const clickable = Boolean(item.nav);
	return (
		<button
			type="button"
			onClick={() => clickable && onNavigate(item)}
			className="bg-wash-2 border border-border-subtle text-text-primary hover:bg-wash-3"
			style={{
				width: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "flex-start",
				gap: 4,
				padding: "12px 14px",
				borderRadius: 12,
				cursor: clickable ? "pointer" : "default",
				textAlign: "left",
				marginBottom: 8,
			}}
		>
			<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
				{item.title}
			</span>
			{item.sub ? (
				<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
					{item.sub}
				</span>
			) : null}
			{item.badge ? (
				<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent, #2563eb)" }}>
					{item.badge}
				</span>
			) : null}
		</button>
	);
}

function SocialVaultGate({ t, userId, onUnlocked }) {
	const setupMode = !hasSocialVault(userId);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async (e) => {
		e.preventDefault();
		setError("");
		if (setupMode) {
			if (password.length < 4) {
				setError(t("edgeDrawer.social.vaultTooShort"));
				return;
			}
			if (password !== confirm) {
				setError(t("edgeDrawer.social.vaultPasswordMismatch"));
				return;
			}
		}
		setBusy(true);
		try {
			if (setupMode) await setupSocialVault(password, [], userId);
			else await unlockSocialVault(password, userId);
			setPassword("");
			setConfirm("");
			onUnlocked?.();
		} catch (err) {
			const msg = err?.message === "Incorrect password"
				? t("edgeDrawer.social.vaultWrongPassword")
				: (err?.message || t("common.error"));
			setError(msg);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit} style={{ padding: "8px 4px 24px" }}>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: "0 0 16px" }}>
				{t("edgeDrawer.social.vaultHint")}
			</p>
			<label className="text-text-secondary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>
				{t("edgeDrawer.social.vaultPassword")}
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete={setupMode ? "new-password" : "current-password"}
					className="bg-surface-raised border border-border-subtle text-text-primary"
					style={{
						display: "block",
						width: "100%",
						boxSizing: "border-box",
						marginTop: 6,
						padding: "12px 14px",
						borderRadius: 10,
						fontSize: 16,
						fontFamily: "'DM Sans', sans-serif",
						minHeight: 44,
					}}
				/>
			</label>
			{setupMode ? (
				<label className="text-text-secondary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
					{t("edgeDrawer.social.vaultConfirm")}
					<input
						type="password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						autoComplete="new-password"
						className="bg-surface-raised border border-border-subtle text-text-primary"
						style={{
							display: "block",
							width: "100%",
							boxSizing: "border-box",
							marginTop: 6,
							padding: "12px 14px",
							borderRadius: 10,
							fontSize: 16,
							fontFamily: "'DM Sans', sans-serif",
							minHeight: 44,
						}}
					/>
				</label>
			) : null}
			{error ? (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: "12px 0 0" }}>{error}</p>
			) : null}
			<button
				type="submit"
				disabled={busy || !password}
				style={{
					marginTop: 16,
					width: "100%",
					background: "#2563eb",
					border: "none",
					borderRadius: 10,
					padding: "12px 16px",
					color: "#fff",
					fontFamily: "'DM Sans', sans-serif",
					fontWeight: 700,
					fontSize: 14,
					cursor: busy || !password ? "not-allowed" : "pointer",
					opacity: busy || !password ? 0.6 : 1,
					minHeight: 44,
				}}
			>
				{setupMode ? t("edgeDrawer.social.vaultCreateBtn") : t("edgeDrawer.social.vaultUnlockBtn")}
			</button>
		</form>
	);
}

/**
 * Shared right-edge drawer for Home, Temp Stay, Food, Shop, Jobs, Rideshare, Venues, Social, Feed.
 * Videos keeps its own VideosSectionEdgeDrawer.
 */
export default function VerticalEdgeDrawer({
	activeNav,
	navigateTo,
	onRequireAuth,
	is404 = false,
	aiPanelOpen = false,
	pageScrollEl = null,
}) {
	const { isMobile } = useViewport();
	const { t } = useTranslation();
	const tabs = useMemo(() => getEdgeDrawerTabs(activeNav), [activeNav]);
	const tabLabels = useMemo(() => tabs.map((tab) => t(tab.labelKey)), [tabs, t]);
	const [panelOpen, setPanelOpen] = useState(false);
	const [panelTab, setPanelTab] = useState(tabs[0]?.id ?? null);
	const [items, setItems] = useState([]);
	const [walletBalance, setWalletBalance] = useState(null);
	const [loading, setLoading] = useState(false);
	const [vaultUnlocked, setVaultUnlocked] = useState(() => isSocialVaultUnlocked(getAuthUserId()));
	const [tabHasContent, setTabHasContent] = useState(/** @type {Record<string, boolean>} */ ({}));
	const [activityTick, setActivityTick] = useState(0);
	const userId = getAuthUserId();

	const visible = shouldShowVerticalEdgeDrawer(activeNav, { isMobile, is404 });
	const [measuredLabelPx, labelMeasurer] = useMeasuredEdgeLabelPx(tabLabels, isMobile, visible);

	useEffect(() => {
		if (!visible) {
			setPanelOpen(false);
			return;
		}
		const first = tabs[0]?.id ?? null;
		setPanelTab((prev) => (tabs.some((tab) => tab.id === prev) ? prev : first));
	}, [activeNav, tabs, visible]);

	useEffect(() => {
		setVaultUnlocked(isSocialVaultUnlocked(userId));
	}, [userId, panelTab, panelOpen]);

	useEffect(() => {
		if (!visible) return undefined;
		let alive = true;
		const run = async () => {
			const ids = tabs.map((tab) => tab.id);
			const probed = await probeEdgeDrawerActivities(activeNav, ids, { vaultUnlocked });
			if (alive) setTabHasContent(probed);
		};
		run();
		const interval = setInterval(run, 90_000);
		window.addEventListener("focus", run);
		return () => {
			alive = false;
			clearInterval(interval);
			window.removeEventListener("focus", run);
		};
	}, [visible, activeNav, tabs, vaultUnlocked, userId]);

	const activeTabDef = tabs.find((tab) => tab.id === panelTab);
	const needsAuth = Boolean(activeTabDef?.auth) && !isAuthenticated();
	const isVaultTab = panelTab === "vault";
	const showVaultGate = isVaultTab && !needsAuth && !vaultUnlocked;

	const loadTab = useCallback(async () => {
		if (!panelOpen || !panelTab || needsAuth) return;
		if (isVaultTab && !vaultUnlocked) {
			setItems([]);
			setWalletBalance(null);
			return;
		}
		setLoading(true);
		try {
			const result = await loadEdgeDrawerTabData(activeNav, panelTab, { vaultUnlocked });
			setItems(Array.isArray(result?.items) ? result.items : []);
			setWalletBalance(result?.walletBalance ?? null);
		} catch {
			setItems([]);
			setWalletBalance(null);
		} finally {
			setLoading(false);
		}
	}, [activeNav, panelOpen, panelTab, needsAuth, isVaultTab, vaultUnlocked]);

	useEffect(() => {
		loadTab();
	}, [loadTab]);

	if (!visible || !tabs.length) return null;

	const scrollbarActive =
		!aiPanelOpen &&
		!!pageScrollEl &&
		pageScrollEl.scrollHeight > pageScrollEl.clientHeight + 8;
	const edgeRight = scrollbarActive ? 8 : 0;

	const panelTitle = activeTabDef
		? t(activeTabDef.titleKey || activeTabDef.labelKey)
		: "";

	const openTab = (tabId) => {
		markEdgeDrawerTabSeen(activeNav, tabId, userId);
		setActivityTick((n) => n + 1);
		setPanelTab(tabId);
		setPanelOpen(true);
	};

	const handleNavigate = (item) => {
		setPanelOpen(false);
		applyDrawerItemHandoff(item);
		if (item.nav) navigateTo?.(item.nav);
	};

	return (
		<>
			{labelMeasurer}
			{tabs.map((tab, index) => (
				<SlideOutEdgeTab
					key={tab.id}
					open={panelOpen && panelTab === tab.id}
					onClick={() => openTab(tab.id)}
					top={stackEdgeTabTop(index, tabs.length, { isMobile, labels: tabLabels, measuredLabelPx })}
					height={edgeTabHeightPx({ isMobile, labels: tabLabels, measuredLabelPx })}
					right={edgeRight}
					compact={isMobile}
					label={t(tab.labelKey)}
					ariaLabel={t(tab.labelKey)}
					hasActivity={activityTick >= 0 && shouldGlowEdgeTab(activeNav, tab.id, Boolean(tabHasContent[tab.id]), userId)}
				/>
			))}
			<SlideOutPanel
				open={panelOpen}
				onClose={() => setPanelOpen(false)}
				title={panelTitle}
				titleVariant="content"
				width={isMobile ? "min(100vw, 400px)" : 400}
				lockScroll={!isMobile}
				headerRight={isVaultTab && vaultUnlocked ? (
					<button
						type="button"
						onClick={() => {
							lockSocialVault(userId);
							setVaultUnlocked(false);
							setItems([]);
						}}
						className="text-text-secondary hover:text-text-primary"
						style={{
							background: "none",
							border: "none",
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 12,
							fontWeight: 600,
							cursor: "pointer",
							minHeight: 44,
							padding: "0 8px",
						}}
					>
						{t("edgeDrawer.social.vaultLock")}
					</button>
				) : null}
			>
				{needsAuth ? (
					<div style={{ textAlign: "center", padding: "32px 12px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16 }}>
							{t("edgeDrawer.signInPrompt")}
						</p>
						<button
							type="button"
							onClick={() => onRequireAuth?.()}
							style={{
								background: "#2563eb",
								border: "none",
								borderRadius: 10,
								padding: "10px 20px",
								color: "#fff",
								fontFamily: "'DM Sans', sans-serif",
								fontWeight: 700,
								fontSize: 13,
								cursor: "pointer",
								minHeight: 44,
							}}
						>
							{t("edgeDrawer.signIn")}
						</button>
					</div>
				) : showVaultGate ? (
					<SocialVaultGate
						t={t}
						userId={userId}
						onUnlocked={() => {
							setVaultUnlocked(true);
						}}
					/>
				) : loading ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
						{t("common.loading")}
					</p>
				) : (
					<>
						{panelTab === "closeFriends" && items.length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 12px 8px" }}>
								{t("edgeDrawer.social.closeFriendsEmpty")}
							</p>
						) : null}
						{panelTab === "closeFriends" && items.length > 0 ? (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, margin: "0 0 12px" }}>
								{t("edgeDrawer.social.closeFriendsHint")}
							</p>
						) : null}
						{walletBalance != null && panelTab === "dashboard" && (
							<div
								className="bg-wash-2 border border-border-subtle"
								style={{ borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}
							>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
									{t("edgeDrawer.walletBalance")}
								</p>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 20, margin: 0 }}>
									${Number(walletBalance).toFixed(2)}
								</p>
							</div>
						)}
						{items.length === 0 && panelTab !== "closeFriends" ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
								{t("edgeDrawer.empty")}
							</p>
						) : (
							items.map((item) => (
								<DrawerLinkRow
									key={`${item.id}-${item.title}`}
									item={item}
									onNavigate={handleNavigate}
								/>
							))
						)}
					</>
				)}
			</SlideOutPanel>
		</>
	);
}

export { VerticalEdgeDrawer };
