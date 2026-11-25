import { useState } from "react";
import { usePageI18n } from "../../hooks/usePageI18n.js";
import {
	JOBS_ACCENT as ACCENT,
	JOBS_FONT as FONT,
	JOBS_RADIUS,
	jobsBlurbStyle,
	jobsBtnStyle,
	jobsEmptyStateStyle,
	jobsFeedbackTextStyle,
	jobsInputStyle,
	jobsSectionLabelStyle,
} from "./jobsLayout.js";
import {
	isPortfolioImage,
	MAX_PORTFOLIO_ITEMS,
	portfolioItemLabel,
} from "../../utils/candidatePortfolio.js";
import { isSafeHttpUrl } from "../../utils/safeUrl.js";

/**
 * Seeker portfolio gallery (upload image/PDF or paste link).
 */
export default function PortfolioGallery({
	items = [],
	onUploadFile,
	onAddLink,
	onRemove,
	readOnly = false,
}) {
	const { t } = usePageI18n("jobs");
	const [linkUrl, setLinkUrl] = useState("");
	const [linkTitle, setLinkTitle] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState(null);

	const list = Array.isArray(items) ? items : [];
	const atCap = list.length >= MAX_PORTFOLIO_ITEMS;

	const run = async (fn) => {
		if (busy) return;
		setBusy(true);
		setErr(null);
		try {
			await fn();
			setLinkUrl("");
			setLinkTitle("");
		} catch (e) {
			setErr(e?.response?.data?.error || e?.message || "Couldn't update portfolio.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div>
				<div style={{ ...jobsSectionLabelStyle, marginBottom: 8 }}>
					{t("jobs.portfolio.title", { defaultValue: "Portfolio" })}
				</div>
				<p style={jobsBlurbStyle}>
					{t("jobs.portfolio.blurb", {
						defaultValue: "Show work samples employers can browse. Images, PDFs, or links.",
					})}
				</p>
			</div>

			{list.length === 0 ? (
				<div className="jobs-empty" style={jobsEmptyStateStyle()} role="status">
					{t("jobs.portfolio.empty", { defaultValue: "No portfolio items yet." })}
				</div>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
						gap: 12,
					}}
				>
					{list.map((item) => {
						const href = isSafeHttpUrl(item.url) ? item.url : null;
						const img = isPortfolioImage(item) && href;
						return (
							<div
								key={item.portfolio_item_id || item.url}
								className="jobs-tile"
								style={{
									borderRadius: JOBS_RADIUS.lg,
									overflow: "hidden",
									border: "1px solid var(--color-border)",
									background: "var(--color-surface-raised)",
									display: "flex",
									flexDirection: "column",
									minHeight: 156,
									boxShadow: "0 1px 0 color-mix(in srgb, var(--color-shadow) 20%, transparent)",
								}}
							>
								{img ? (
									<a
										href={href}
										target="_blank"
										rel="noreferrer"
										aria-label={portfolioItemLabel(item)}
										style={{ display: "block", aspectRatio: "4/3", background: "var(--color-surface)", overflow: "hidden" }}
									>
										<img
											src={href}
											alt={portfolioItemLabel(item)}
											style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
										/>
									</a>
								) : (
									<a
										href={href || undefined}
										target="_blank"
										rel="noreferrer"
										aria-label={portfolioItemLabel(item)}
										style={{
											flex: 1,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											padding: 12,
											textDecoration: "none",
											color: ACCENT,
											fontFamily: FONT,
											fontWeight: 700,
											fontSize: 13,
											letterSpacing: "0.04em",
											aspectRatio: "4/3",
											background: "linear-gradient(145deg, color-mix(in srgb, #2563eb 14%, transparent), transparent)",
										}}
									>
										{String(item.media_type || "link").toUpperCase()}
									</a>
								)}
								<div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
									<div
										style={{
											flex: 1,
											minWidth: 0,
											fontFamily: FONT,
											fontSize: 12,
											fontWeight: 600,
											lineHeight: 1.35,
											color: "var(--color-text-primary)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={portfolioItemLabel(item)}
									>
										{portfolioItemLabel(item)}
									</div>
									{!readOnly && (
										<button
											type="button"
											className="jobs-btn jobs-btn--danger"
											style={jobsBtnStyle({ danger: true, compact: true, disabled: busy })}
											disabled={busy}
											aria-label={t("jobs.portfolio.remove", { defaultValue: "Remove" })}
											onClick={() => run(() => onRemove?.(item))}
										>
											{t("jobs.portfolio.remove", { defaultValue: "Remove" })}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{!readOnly && (
				<div style={{ display: "grid", gap: 12 }}>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
						<label
							className="jobs-btn"
							style={{
								...jobsBtnStyle({ disabled: atCap || busy }),
								display: "inline-flex",
								alignItems: "center",
								cursor: atCap || busy ? "not-allowed" : "pointer",
							}}
						>
							{busy ? t("jobs.portfolio.working", { defaultValue: "Working…" }) : t("jobs.portfolio.upload", { defaultValue: "Upload image / PDF" })}
							<input
								type="file"
								accept=".pdf,image/*"
								hidden
								disabled={atCap || busy}
								aria-label={t("jobs.portfolio.upload", { defaultValue: "Upload image / PDF" })}
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = "";
									if (file) run(() => onUploadFile?.(file));
								}}
							/>
						</label>
						<span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.02em" }}>
							{list.length}/{MAX_PORTFOLIO_ITEMS}
						</span>
					</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
						<input
							className="jobs-input"
							style={jobsInputStyle({ flex: "1 1 180px", width: "auto" })}
							placeholder={t("jobs.portfolio.linkPlaceholder", { defaultValue: "https://…" })}
							value={linkUrl}
							disabled={atCap || busy}
							aria-label={t("jobs.portfolio.linkPlaceholder", { defaultValue: "https://…" })}
							onChange={(e) => setLinkUrl(e.target.value)}
						/>
						<input
							className="jobs-input"
							style={jobsInputStyle({ flex: "1 1 120px", width: "auto" })}
							placeholder={t("jobs.portfolio.titlePlaceholder", { defaultValue: "Title (optional)" })}
							value={linkTitle}
							disabled={atCap || busy}
							aria-label={t("jobs.portfolio.titlePlaceholder", { defaultValue: "Title (optional)" })}
							onChange={(e) => setLinkTitle(e.target.value)}
						/>
						<button
							type="button"
							className="jobs-btn jobs-btn--primary"
							style={jobsBtnStyle({ primary: true, disabled: atCap || busy })}
							disabled={atCap || busy}
							onClick={() => run(() => onAddLink?.({ url: linkUrl, title: linkTitle }))}
						>
							{t("jobs.portfolio.addLink", { defaultValue: "Add link" })}
						</button>
					</div>
					{err && (
						<div className="jobs-feedback jobs-feedback--err" role="alert" style={jobsFeedbackTextStyle()}>
							{err}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
