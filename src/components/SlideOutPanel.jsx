/**
 * SlideOutPanel — reusable edge drawer for Videos (and anywhere else).
 *
 * Not tied to Watch History: pass any `children` (history, queue, playlist,
 * recommendations, categories, …). Pair with `SlideOutEdgeTab` for the
 * small edge handle that opens it without interrupting video playback.
 *
 * Desktop + tablet: slides in from the right. Backdrop tap / Escape / close
 * button dismiss it. Focus is trapped inside. Body scroll lock is opt-in
 * (`lockScroll`, default true) — Videos watch-edge passes false so the laptop
 * page scrollbar keeps working while the drawer is open.
 * (Videos watch-edge drawer mounts this only when !isMobile — phone uses another pattern.)
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

const EXIT_MS = 220;

const KEYFRAMES = `
@keyframes slideOutFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideOutFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes slideOutPanelIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes slideOutPanelOut {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
/* Unseen glow on an edge tab: a slow breath, not a blink, and stilled for anyone who asked for
   less motion. */
@keyframes slideOutTabGlow {
  0%, 100% { box-shadow: 0 8px 24px var(--color-shadow), 0 0 0 1px rgba(37,99,235,0.35), 0 0 12px rgba(37,99,235,0.30); }
  50%      { box-shadow: 0 8px 24px var(--color-shadow), 0 0 0 1px rgba(37,99,235,0.55), 0 0 22px rgba(37,99,235,0.55); }
}
@media (prefers-reduced-motion: reduce) {
  [data-edge-tab-unseen] { animation: none !important; }
}
`;

let injected = false;
function useSlideOutKeyframes() {
	useEffect(() => {
		if (injected || typeof document === "undefined") return;
		injected = true;
		const el = document.createElement("style");
		el.setAttribute("data-slide-out-panel", "");
		el.textContent = KEYFRAMES;
		document.head.appendChild(el);
	}, []);
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.headerRight]
 * @param {React.ReactNode} props.children
 * @param {'right'|'left'} [props.side]
 * @param {number|string} [props.width] panel width (Videos watch-edge uses a fixed desktop width)
 * @param {string} [props.labelledBy]
 * @param {boolean} [props.lockScroll]
 * @param {'brand'|'content'} [props.titleVariant] brand = Barlow uppercase; content = DM Sans sentence case (YouTube-like drawers)
 */
export function SlideOutPanel({
	open,
	onClose,
	title,
	headerRight,
	children,
	side = "right",
	width = 380,
	labelledBy,
	lockScroll = true,
	titleVariant = "brand",
}) {
	useSlideOutKeyframes();
	const autoId = useId();
	const titleId = labelledBy || `slide-out-title-${autoId}`;
	const [mounted, setMounted] = useState(open);
	const [closing, setClosing] = useState(false);
	const timerRef = useRef(null);
	const trapRef = useFocusTrap(mounted && !closing);
	const fromLeft = side === "left";

	useEffect(() => {
		if (open) {
			setMounted(true);
			setClosing(false);
			return undefined;
		}
		if (!mounted) return undefined;
		setClosing(true);
		timerRef.current = setTimeout(() => {
			setMounted(false);
			setClosing(false);
		}, EXIT_MS);
		return () => clearTimeout(timerRef.current);
	}, [open, mounted]);

	const requestClose = useCallback(() => {
		if (closing) return;
		onClose?.();
	}, [closing, onClose]);

	useEffect(() => {
		if (!mounted) return undefined;
		const onKey = (e) => { if (e.key === "Escape") requestClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mounted, requestClose]);

	useEffect(() => {
		if (!mounted || !lockScroll) return undefined;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [mounted, lockScroll]);

	if (!mounted || typeof document === "undefined") return null;

	const panelAnim = closing
		? "slideOutPanelOut 0.22s cubic-bezier(0.4, 0, 1, 1) both"
		: "slideOutPanelIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both";
	const backdropAnim = closing
		? "slideOutFadeOut 0.18s ease both"
		: "slideOutFadeIn 0.16s ease both";

	const widthCss = typeof width === "number" ? `${width}px` : width;

	return createPortal(
		<>
			<div
				onClick={requestClose}
				aria-hidden="true"
				style={{
					position: "fixed",
					inset: 0,
					background: "rgba(8,9,13,0.5)",
					backdropFilter: "blur(6px) saturate(130%)",
					WebkitBackdropFilter: "blur(6px) saturate(130%)",
					zIndex: 340,
					animation: backdropAnim,
				}}
			/>
			<div
				ref={trapRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? titleId : undefined}
				className="bg-surface-raised border-border"
				style={{
					position: "fixed",
					top: 0,
					bottom: 0,
					...(fromLeft ? { left: 0 } : { right: 0 }),
					zIndex: 341,
					width: `min(${widthCss}, 100vw)`,
					maxWidth: "100vw",
					display: "flex",
					flexDirection: "column",
					...(fromLeft
						? { borderRight: "1px solid var(--color-border)" }
						: { borderLeft: "1px solid var(--color-border)" }),
					boxShadow: fromLeft
						? "16px 0 48px var(--color-shadow)"
						: "-16px 0 48px var(--color-shadow)",
					animation: panelAnim,
					overflow: "hidden",
					paddingTop: "env(safe-area-inset-top, 0px)",
					paddingBottom: "env(safe-area-inset-bottom, 0px)",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "14px 14px 12px 16px",
						borderBottom: "1px solid var(--color-border-subtle)",
						flexShrink: 0,
					}}
				>
					{title != null && (
						<h2
							id={titleId}
							className="text-text-primary"
							style={titleVariant === "content"
								? {
									flex: 1,
									minWidth: 0,
									margin: 0,
									fontFamily: "'DM Sans', sans-serif",
									fontWeight: 600,
									fontSize: 16,
									lineHeight: 1.25,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}
								: {
									flex: 1,
									minWidth: 0,
									margin: 0,
									fontFamily: "'Barlow Condensed', sans-serif",
									fontWeight: 700,
									fontSize: 18,
									letterSpacing: "0.04em",
									textTransform: "uppercase",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
						>
							{title}
						</h2>
					)}
					{!title && <div style={{ flex: 1 }} />}
					{headerRight}
					<button
						type="button"
						onClick={requestClose}
						aria-label="Close"
						className="text-text-secondary hover:text-text-primary bg-wash-2 border border-border-subtle"
						style={{
							width: 36,
							height: 36,
							borderRadius: 10,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							flexShrink: 0,
							padding: 0,
						}}
					>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div
					className="styled-scrollbar"
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						WebkitOverflowScrolling: "touch",
						padding: "12px 14px 20px",
					}}
				>
					{children}
				</div>
			</div>
		</>,
		document.body,
	);
}

/**
 * Edge handle that opens a SlideOutPanel. Stays outside the player so
 * opening the drawer never remounts video chrome.
 *
 * @param {object} props
 * @param {() => void} props.onClick
 * @param {string} [props.label]
 * @param {boolean} [props.open] when true, tab hides (panel owns the edge)
 * @param {'right'|'left'} [props.side]
 * @param {string} [props.ariaLabel]
 * @param {string|number} [props.top] CSS `top` (default mid-screen)
 * @param {string|number} [props.right] CSS `right` when `side` is right (scrollbar gutter)
 * @param {string|number} [props.left] CSS `left` when `side` is left
 * @param {string} [props.badge] Unseen count to show on the tab ("3", "9+"); "" leaves it quiet
 * @param {boolean} [props.hasActivity] subtle glow/dot when tab has unseen content (no count; not a notification)
 * @param {boolean} [props.compact] tighter tab for mobile / narrow viewports
 * @param {string|number} [props.height] optional shared footprint for evenly spaced tab groups
 */
export function SlideOutEdgeTab({
	onClick,
	label,
	open = false,
	side = "right",
	ariaLabel,
	top = "42%",
	right = 0,
	left = 0,
	badge = "",
	hasActivity = false,
	compact = false,
	height,
}) {
	if (open) return null;
	const fromLeft = side === "left";
	const baseLabel = ariaLabel || label || "Open panel";
	const hasBadge = typeof badge === "string" && badge.length > 0;
	const unseen = hasBadge || hasActivity;
	const tabWidth = compact ? 40 : 44;
	const labelMaxH = compact ? 64 : 80;
	// Non-label chrome eaten from `height` by the label's maxHeight below: vertical padding
	// (8/10px × 2) + border (1px × 2) + column gap + the arrow icon's own height. Keep in sync with
	// EDGE_TAB_LABEL_CHROME_PX in verticalEdgeDrawerConfig.js — a mismatch here clips the last
	// letter or two of longer labels (e.g. "DASHBOARD").
	const labelChromePx = compact ? 8 * 2 + 2 + 4 + 12 : 10 * 2 + 2 + 6 + 14;
	return (
		<button
			type="button"
			onClick={onClick}
			data-testid="slide-out-edge-tab"
			data-compact={compact ? "true" : "false"}
			data-has-activity={hasActivity ? "true" : "false"}
			{...(unseen ? { "data-edge-tab-unseen": hasBadge ? badge : "1" } : {})}
			aria-label={hasActivity ? `${baseLabel}, has updates` : baseLabel}
			aria-expanded={false}
			className="bg-surface-raised border-border text-text-secondary"
			style={{
				position: "fixed",
				top,
				...(fromLeft ? { left } : { right }),
				// Above the global Strug AI fab (zIndex 45) so the tab stays clickable.
				zIndex: 300,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: compact ? 4 : 6,
				width: tabWidth,
				minWidth: tabWidth,
				boxSizing: "border-box",
				isolation: "isolate",
				padding: compact ? "8px 5px" : "10px 6px",
				borderRadius: fromLeft ? "0 14px 14px 0" : "14px 0 0 14px",
				border: unseen
					? "1px solid rgba(37, 99, 235, 0.55)"
					: "1px solid var(--color-border)",
				...(fromLeft
					? { borderLeft: "none" }
					: { borderRight: "none" }),
				boxShadow: fromLeft
					? "4px 5px 14px var(--color-shadow)"
					: "-4px 5px 14px var(--color-shadow)",
				backdropFilter: "blur(12px)",
				WebkitBackdropFilter: "blur(12px)",
				cursor: "pointer",
				WebkitTapHighlightColor: "transparent",
				...(height != null ? { height, overflow: "hidden" } : {}),
				...(unseen
					? {
						animation: "slideOutTabGlow 2.4s ease-in-out infinite",
						borderColor: "rgba(37,99,235,0.55)",
					}
					: {}),
			}}
		>
			{hasBadge ? (
				<span
					data-testid="slide-out-edge-tab-badge"
					style={{
						position: "absolute",
						top: -6,
						...(fromLeft ? { right: -6 } : { left: -6 }),
						minWidth: 17,
						height: 17,
						padding: "0 4px",
						boxSizing: "border-box",
						borderRadius: 9,
						background: "linear-gradient(160deg, #2563eb, #7c3aed)",
						color: "#fff",
						fontFamily: "'DM Sans', sans-serif",
						fontSize: 10,
						fontWeight: 800,
						lineHeight: "17px",
						textAlign: "center",
						boxShadow: "0 2px 8px rgba(37,99,235,0.45)",
						pointerEvents: "none",
					}}
				>
					{badge}
				</span>
			) : null}
			{!hasBadge && hasActivity ? (
				<span
					aria-hidden="true"
					data-testid="slide-out-edge-tab-activity-dot"
					style={{
						position: "absolute",
						top: 6,
						...(fromLeft ? { left: 6 } : { right: 6 }),
						width: 7,
						height: 7,
						borderRadius: "50%",
						background: "#2563eb",
						boxShadow: "0 0 6px rgba(37, 99, 235, 0.85)",
						pointerEvents: "none",
					}}
				/>
			) : null}
			{label ? (
				<span
					style={{
						writingMode: "vertical-rl",
						textOrientation: "mixed",
						transform: fromLeft ? "rotate(180deg)" : undefined,
						fontFamily: "'DM Sans', sans-serif",
						fontSize: compact ? 10 : 11,
						fontWeight: 700,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						lineHeight: 1.15,
						maxHeight: height != null ? `calc(${typeof height === "number" ? `${height}px` : height} - ${labelChromePx}px)` : labelMaxH,
						overflow: "hidden",
						textAlign: "center",
						whiteSpace: "nowrap",
					}}
				>
					{label}
				</span>
			) : null}
			<svg
				width={compact ? 12 : 14}
				height={compact ? 12 : 14}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				style={{ flexShrink: 0, transform: fromLeft ? "rotate(180deg)" : undefined }}
			>
				<polyline points="15 18 9 12 15 6" />
			</svg>
		</button>
	);
}

export default SlideOutPanel;
