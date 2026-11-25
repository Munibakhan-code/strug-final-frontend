/**
 * YouTube-style bottom nav for the mobile Videos section only.
 * Replaces the global Home/Social/Rideshare/Videos/More bar while Videos is open.
 */
import { createPortal } from "react-dom";
import { createElement, useEffect } from "react";
import i18n from "../../i18n/index.js";
import { badgeLabel } from "../../utils/videosDrawerBadges.js";
import { tabUnseenLabel } from "../../utils/videosDrawerBadgeCopy.js";
import { VIDEOS_MOBILE_NAV_HEIGHT } from "../../utils/videosMobileChrome.js";

const ACCENT = "#2563eb";
export { VIDEOS_MOBILE_NAV_HEIGHT } from "../../utils/videosMobileChrome.js";

const IconHome = () => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<path d="M3 10.5 12 3l9 7.5" />
		<path d="M5 10v10h14V10" />
	</svg>
);
const IconClips = () => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<rect x="3" y="3" width="18" height="18" rx="4" />
		<path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
	</svg>
);
const IconUpload = () => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<circle cx="12" cy="12" r="9" />
		<path d="M12 8v8M8 12h8" />
	</svg>
);
const IconExplore = () => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<circle cx="12" cy="12" r="9" />
		<path d="m16 8-2.5 6.5L7 17l2.5-6.5L16 8z" />
	</svg>
);
const IconProfile = () => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<path d="M20 21a8 8 0 0 0-16 0" />
		<circle cx="12" cy="8" r="4" />
	</svg>
);

function ActionSheet({ open, title, onClose, children, testId }) {
	useEffect(() => {
		if (!open || typeof document === "undefined") return undefined;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = previousOverflow; };
	}, [open]);
	if (!open || typeof document === "undefined") return null;
	// Sit above the Videos bottom nav so Explore/Profile can toggle-close, and leave nav tappable.
	// The nav's own height grows by the safe-area inset, so clear that too.
	const aboveNav = `calc(${VIDEOS_MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;
	return createPortal(
		<>
			{/* Backdrop — tap dimmed area closes. Stops above nav so tab bar stays usable. */}
			<div
				role="presentation"
				data-testid={`${testId}-backdrop`}
				onClick={onClose}
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					bottom: aboveNav,
					background: "rgba(0,0,0,0.45)",
					zIndex: 9200,
				}}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				data-testid={testId}
				className="bg-surface-raised border border-border"
				onClick={(e) => e.stopPropagation()}
				style={{
					position: "fixed",
					left: 0,
					right: 0,
					bottom: aboveNav,
					zIndex: 9201,
					borderRadius: "16px 16px 0 0",
					padding: "14px 12px 16px",
					boxShadow: "0 -12px 40px var(--color-shadow)",
					maxHeight: `calc(100dvh - ${VIDEOS_MOBILE_NAV_HEIGHT}px - env(safe-area-inset-bottom, 0px))`,
					overflowY: "auto",
				}}
			>
				<div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border)", margin: "0 auto 12px" }} />
				<div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 10px", minWidth: 0 }}>
					<p className="text-text-primary" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>
						{title}
					</p>
					<button
						type="button"
						aria-label={i18n.t("common.close", { defaultValue: "Close" })}
						data-testid={`${testId}-close`}
						onClick={onClose}
						className="text-text-secondary"
						style={{
							width: 36,
							height: 36,
							borderRadius: 10,
							border: "1px solid var(--color-border)",
							background: "var(--color-surface)",
							cursor: "pointer",
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
					</button>
				</div>
				{children}
			</div>
		</>,
		document.body,
	);
}

function SheetRow({ label, onClick, testId, count = 0 }) {
	const badge = badgeLabel(count);
	return (
		<button
			type="button"
			data-testid={testId}
			// The count is a pill, not text: the name has to carry it for a screen reader.
			aria-label={badge ? tabUnseenLabel(label, count) : undefined}
			onClick={onClick}
			className="text-text-primary"
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				width: "100%",
				padding: "14px 12px",
				border: "none",
				borderRadius: 10,
				background: "transparent",
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 15,
				fontWeight: 600,
				textAlign: "left",
				cursor: "pointer",
			}}
		>
			<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
			{badge && (
				<span
					aria-hidden="true"
					data-testid={`${testId}-count`}
					style={{
						flexShrink: 0,
						minWidth: 20,
						height: 20,
						padding: "0 6px",
						borderRadius: 10,
						background: "linear-gradient(135deg, #2563eb, #7c3aed)",
						color: "#fff",
						fontSize: 11,
						fontWeight: 700,
						lineHeight: "20px",
						textAlign: "center",
					}}
				>
					{badge}
				</span>
			)}
		</button>
	);
}

/**
 * @param {object} props
 * @param {'home'|'clips'|'upload'|'explore'|'profile'|null} props.active
 * @param {boolean} [props.exploreOpen]
 * @param {boolean} [props.profileOpen]
 * @param {() => void} props.onHome
 * @param {() => void} props.onClips
 * @param {() => void} props.onUpload
 * @param {() => void} props.onExploreOpen
 * @param {() => void} props.onExploreClose
 * @param {(tab: 'history'|'creatorChoice'|'subs'|'circle'|'analytics') => void} props.onExplorePick
 * @param {{creatorChoice?: number, subs?: number, circle?: number}} [props.exploreCounts] Unseen
 *   rows behind each Explore destination — the phone's stand-in for the desktop edge tab badges.
 * @param {() => void} props.onProfileOpen
 * @param {() => void} props.onProfileClose
 * @param {() => void} props.onMyChannel
 * @param {() => void} props.onCreatorStudio
 */
export default function VideosMobileBottomNav({
	active,
	exploreOpen = false,
	profileOpen = false,
	onHome,
	onClips,
	onUpload,
	onExploreOpen,
	onExploreClose,
	onExplorePick,
	exploreCounts,
	onProfileOpen,
	onProfileClose,
	onMyChannel,
	onCreatorStudio,
}) {
	// Escape closes whichever sheet is open.
	useEffect(() => {
		if (!exploreOpen && !profileOpen) return undefined;
		const onKey = (e) => {
			if (e.key !== "Escape") return;
			if (exploreOpen) onExploreClose?.();
			if (profileOpen) onProfileClose?.();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [exploreOpen, profileOpen, onExploreClose, onProfileClose]);

	const counts = {
		creatorChoice: Number(exploreCounts?.creatorChoice) || 0,
		subs: Number(exploreCounts?.subs) || 0,
		circle: Number(exploreCounts?.circle) || 0,
	};
	// One number on the closed tab, because the destinations are behind it: the viewer cannot see
	// which one has news until the sheet is open, and that is where the split is shown.
	const exploreTotal = counts.creatorChoice + counts.subs + counts.circle;

	const tabs = [
		{ id: "home", label: i18n.t("nav.home", { defaultValue: "Home" }), Icon: IconHome, onClick: onHome },
		{ id: "clips", label: i18n.t("videos.shorts", { defaultValue: "Clips" }), Icon: IconClips, onClick: onClips },
		{ id: "upload", label: i18n.t("common.upload", { defaultValue: "Upload" }), Icon: IconUpload, onClick: onUpload },
		{
			id: "explore",
			label: i18n.t("videos.mobileNav.explore", { defaultValue: "Explore" }),
			Icon: IconExplore,
			onClick: () => (exploreOpen ? onExploreClose() : onExploreOpen()),
			badge: badgeLabel(exploreTotal),
			badgeCount: exploreTotal,
		},
		{
			id: "profile",
			label: i18n.t("videos.mobileNav.profile", { defaultValue: "Profile" }),
			Icon: IconProfile,
			onClick: () => (profileOpen ? onProfileClose() : onProfileOpen()),
		},
	];

	const sheetOpen = exploreOpen || profileOpen;
	if (typeof document === "undefined") return null;

	return (
		<>
			{createPortal(
				<nav
					data-testid="videos-mobile-bottom-nav"
					aria-label={i18n.t("videos.brandTitle", { defaultValue: "Strug Videos" })}
					className="bg-surface-glass"
					style={{
						position: "fixed",
						bottom: 0,
						left: 0,
						right: 0,
						// Tailwind's preflight makes this border-box, so the inset has to be added to the
						// height or it would be eaten out of the 62px row and squeeze the icons on a
						// notched phone. VIDEOS_MOBILE_NAV_HEIGHT stays the row height everything else
						// (sheet offsets, page padding) measures against.
						height: `calc(${VIDEOS_MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
						backdropFilter: "blur(16px)",
						borderTop: "1px solid var(--color-border)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-around",
						// Above backdrop when a sheet is open so Explore/Profile can toggle-close.
						zIndex: sheetOpen ? 9202 : 70,
						paddingBottom: "env(safe-area-inset-bottom, 0px)",
					}}
				>
					{tabs.map(({ id, label, Icon, onClick, badge, badgeCount }) => {
						const selected = active === id || (id === "explore" && exploreOpen) || (id === "profile" && profileOpen);
						return (
							<button
								key={id}
								type="button"
								aria-label={badge ? tabUnseenLabel(label, badgeCount) : label}
								aria-current={selected ? "page" : undefined}
								onClick={onClick}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 3,
									background: "none",
									border: "none",
									color: selected ? ACCENT : "var(--color-text-muted)",
									cursor: "pointer",
									padding: "6px 10px",
									flex: 1,
									minWidth: 0,
								}}
							>
								<span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
									{/* createElement, not <Icon />: this config's no-unused-vars misses JSX-only refs. */}
									{createElement(Icon)}
									{badge && (
										<span
											aria-hidden="true"
											data-testid={`videos-mobile-nav-${id}-count`}
											style={{
												position: "absolute",
												top: -5,
												left: "58%",
												minWidth: 16,
												height: 16,
												padding: "0 4px",
												borderRadius: 8,
												background: "linear-gradient(135deg, #2563eb, #7c3aed)",
												color: "#fff",
												fontFamily: "'DM Sans', sans-serif",
												fontSize: 10,
												fontWeight: 700,
												lineHeight: "16px",
												textAlign: "center",
											}}
										>
											{badge}
										</span>
									)}
								</span>
								<span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: selected ? 700 : 500 }}>{label}</span>
							</button>
						);
					})}
				</nav>,
				document.body,
			)}

			<ActionSheet
				open={exploreOpen}
				title={i18n.t("videos.mobileNav.explore", { defaultValue: "Explore" })}
				onClose={onExploreClose}
				testId="videos-explore-sheet"
			>
				{/* History carries no count: the viewer's own watches are never news to them. */}
				<SheetRow
					testId="videos-explore-history"
					label={i18n.t("videos.edgeDrawer.history")}
					onClick={() => onExplorePick("history")}
				/>
				<SheetRow
					testId="videos-explore-choice"
					label={i18n.t("videos.creatorsChoice")}
					count={counts.creatorChoice}
					onClick={() => onExplorePick("creatorChoice")}
				/>
				<SheetRow
					testId="videos-explore-subs"
					label={i18n.t("videos.edgeDrawer.subs")}
					count={counts.subs}
					onClick={() => onExplorePick("subs")}
				/>
				<SheetRow
					testId="videos-explore-circle"
					label={i18n.t("videos.edgeDrawer.circle")}
					count={counts.circle}
					onClick={() => onExplorePick("circle")}
				/>
				<SheetRow
					testId="videos-explore-analytics"
					label="Viewing Insights"
					onClick={() => onExplorePick("analytics")}
				/>
			</ActionSheet>

			<ActionSheet
				open={profileOpen}
				title={i18n.t("videos.mobileNav.profile", { defaultValue: "Profile" })}
				onClose={onProfileClose}
				testId="videos-profile-sheet"
			>
				<SheetRow
					testId="videos-profile-channel"
					label={i18n.t("videos.mobileNav.myChannel", { defaultValue: "My channel" })}
					onClick={onMyChannel}
				/>
				<SheetRow
					testId="videos-profile-studio"
					label={i18n.t("videos.creatorStudio", { defaultValue: "Creator Studio" })}
					onClick={onCreatorStudio}
				/>
			</ActionSheet>
		</>
	);
}
