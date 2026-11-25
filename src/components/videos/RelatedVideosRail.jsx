/**
 * Related / Up Next video list — used on the watch page (desktop sticky sidebar
 * and mobile stack under the player). Keeps one data-driven list; layout differs
 * only via `isMobile` / `stickyOffset`.
 */
import i18n from "../../i18n/index.js";
import { clickableProps } from "../shared.jsx";
import { MOBILE_WATCH_TYPE } from "../../utils/mobileWatchTypography.js";

/**
 * @param {object} props
 * @param {boolean} props.isMobile
 * @param {number} [props.stickyOffset]
 * @param {boolean} [props.sticky]
 * @param {Array<{id:string,label:string}>} props.railChips
 * @param {string} props.railChip
 * @param {(id: string) => void} props.onRailChip
 * @param {React.Ref} props.chipScrollRef
 * @param {{left:boolean,right:boolean}} props.chipEdges
 * @param {() => void} props.onChipScroll
 * @param {(dir: number) => void} props.onScrollChips
 * @param {React.Ref} [props.labelRef]
 * @param {Array} props.railList
 * @param {(v: object) => void} [props.onSelect]
 * @param {() => void} [props.onBack]
 * @param {boolean} [props.canPage]
 * @param {React.Ref} [props.sentinelRef]
 * @param {boolean} [props.loadingMore]
 * @param {boolean} [props.showHeading]
 */
export default function RelatedVideosRail({
	isMobile,
	stickyOffset = 0,
	sticky = false,
	railChips,
	railChip,
	onRailChip,
	chipScrollRef,
	chipEdges,
	onChipScroll,
	onScrollChips,
	labelRef,
	railList,
	onSelect,
	onBack,
	canPage = false,
	sentinelRef,
	loadingMore = false,
	showHeading = false,
}) {
	const pick = (v) => {
		if (onSelect) onSelect(v);
		else onBack?.();
	};

	return (
		<div
			style={{
				...(isMobile
					? { width: "100%", flexShrink: 0, marginTop: 4, marginBottom: 8 }
					: { flex: "1 1 260px", minWidth: 260, maxWidth: 460 }),
				marginTop: isMobile ? 4 : stickyOffset,
				...(isMobile
					? { overflowY: "visible" }
					: sticky
						? { position: "sticky", top: 0, alignSelf: "flex-start", overflowY: "visible" }
						: {}),
			}}
		>
			{showHeading && (
				<h3
					className="text-text-primary"
					style={{
						fontFamily: "'Barlow Condensed', sans-serif",
						fontWeight: 700,
						fontSize: 20,
						letterSpacing: "0.05em",
						textTransform: "uppercase",
						margin: "0 0 12px",
					}}
				>
					{i18n.t("videos.upNext")}
				</h3>
			)}
			<div ref={labelRef} style={{ position: "relative", marginBottom: 14 }}>
				<div
					ref={chipScrollRef}
					onScroll={onChipScroll}
					role="radiogroup"
					aria-label={i18n.t("videos.upNext")}
					className="strug-share-row"
					style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}
				>
					{railChips.map((chip) => {
						const selected = chip.id === railChip;
						return (
							<button
								key={chip.id}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => onRailChip(chip.id)}
								className={[
									"flex-shrink-0 whitespace-nowrap select-none rounded-full border cursor-pointer",
									"transition-[background-color,color,border-color] duration-150",
									selected
										? "border-transparent text-white"
										: "bg-wash-2 border-border-subtle text-text-secondary hover:bg-wash-3 hover:text-text-primary",
								].join(" ")}
								style={{
									fontFamily: "'DM Sans', sans-serif",
									fontSize: isMobile ? MOBILE_WATCH_TYPE.chip.fontSize : 12.5,
									fontWeight: MOBILE_WATCH_TYPE.chip.fontWeight,
									lineHeight: 1,
									padding: "0 14px",
									height: 32,
									maxWidth: 220,
									overflow: "hidden",
									textOverflow: "ellipsis",
									background: selected ? "#2563eb" : undefined,
								}}
							>
								{chip.label}
							</button>
						);
					})}
				</div>
				{[["left", chipEdges.left, -1], ["right", chipEdges.right, 1]].map(([side, shown, dir]) => shown && (
					<button
						key={side}
						type="button"
						aria-label={i18n.t(dir < 0 ? "common.previous" : "common.next")}
						onClick={() => onScrollChips(dir)}
						className="bg-surface-raised border border-border text-text-primary"
						style={{
							position: "absolute",
							top: 0,
							[side]: 0,
							height: 32,
							width: 32,
							borderRadius: "50%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							boxShadow: "0 2px 12px var(--color-shadow)",
							padding: 0,
						}}
					>
						<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points={dir < 0 ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
						</svg>
					</button>
				))}
			</div>
			{/* Mobile thumbs match YouTube Up Next density (~120×68), not home-feed card size. */}
			<div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 12 }}>
				{railList.length === 0 && (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>
						{i18n.t("videos.noRecommendations")}
					</p>
				)}
				{railList.map((v, i) => (
					<div
						key={v.id ?? v.videoId ?? `r-${i}`}
						onClick={() => pick(v)}
						{...clickableProps(() => pick(v))}
						style={{
							display: "flex",
							gap: isMobile ? 10 : 10,
							cursor: "pointer",
							animation: `fadeUp 0.3s ease ${i * 40}ms both`,
							alignItems: "flex-start",
						}}
					>
						<div
							style={{
								...(isMobile
									? { width: 120, height: 68 }
									: { width: "46%", minWidth: 168, maxWidth: 220, aspectRatio: "16 / 9" }),
								borderRadius: isMobile ? 6 : 8,
								background: v.thumb && v.thumb.startsWith("http") ? "#000" : (v.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)"),
								flexShrink: 0,
								position: "relative",
								overflow: "hidden",
							}}
						>
							{v.thumb && v.thumb.startsWith("http") && (
								<img
									loading="lazy"
									decoding="async"
									src={v.thumb}
									alt=""
									style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }}
								/>
							)}
							{v.duration && (
								<div style={{
									position: "absolute", bottom: isMobile ? 3 : 4, right: isMobile ? 4 : 5,
									background: "rgba(0,0,0,0.8)", borderRadius: 3, padding: isMobile ? "1px 4px" : "1px 5px",
									fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 10 : 11, fontWeight: 700, color: "#fff",
								}}>
									{v.duration}
								</div>
							)}
						</div>
						<div style={{ flex: 1, minWidth: 0, paddingTop: 0 }}>
							<p
								className="text-text-primary"
								style={{
									fontFamily: "'DM Sans', sans-serif",
									fontSize: isMobile ? MOBILE_WATCH_TYPE.relatedTitle.fontSize : 13.5,
									fontWeight: isMobile ? MOBILE_WATCH_TYPE.relatedTitle.fontWeight : 600,
									lineHeight: isMobile ? MOBILE_WATCH_TYPE.relatedTitle.lineHeight : 1.3,
									marginBottom: isMobile ? 2 : 4,
									display: "-webkit-box",
									WebkitLineClamp: 2,
									WebkitBoxOrient: "vertical",
									overflow: "hidden",
								}}
							>
								{v.title}
							</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 12, marginBottom: 1 }}>
								{v.channel}
							</p>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 12 }}>
								{v.views}
							</p>
						</div>
					</div>
				))}
				{canPage && railChip === "all" && (
					<div ref={sentinelRef} style={{ height: 1 }} />
				)}
				{loadingMore && railChip === "all" && (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", padding: "6px 0" }}>
						{i18n.t("videos.loadingMore", { defaultValue: "Loading more…" })}
					</p>
				)}
			</div>
		</div>
	);
}
