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
	createResumeVersion,
	deleteResumeVersion,
	generateResumePdf,
	updateResumeVersion,
} from "../../api/jobs.js";
import { isSafeHttpUrl } from "../../utils/safeUrl.js";

/**
 * Multi-resume version list + server PDF generation.
 */
export default function ResumeVersionsPanel({
	resumes = [],
	activeResumeJson,
	onChangeResumes,
	onLoadVersion,
	onPdfUrl,
}) {
	const { t } = usePageI18n("jobs");
	const [label, setLabel] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState(null);
	const [ok, setOk] = useState(null);
	const list = Array.isArray(resumes) ? resumes : [];

	const run = async (fn, successText) => {
		if (busy) return;
		setBusy(true);
		setErr(null);
		setOk(null);
		try {
			await fn();
			if (successText) setOk(successText);
		} catch (e) {
			setErr(e?.response?.data?.error || e?.message || "Couldn't update résumés.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div>
				<div style={{ ...jobsSectionLabelStyle, marginBottom: 8 }}>
					{t("jobs.resumeVersions.title", { defaultValue: "Résumé versions" })}
				</div>
				<p style={jobsBlurbStyle}>
					{t("jobs.resumeVersions.blurb", {
						defaultValue: "Keep named versions (e.g. Product, Tech). Default drives Easy Apply.",
					})}
				</p>
			</div>

			{list.length === 0 ? (
				<div className="jobs-empty" style={jobsEmptyStateStyle()} role="status">
					{t("jobs.resumeVersions.empty", { defaultValue: "No saved versions yet. Save one from your current builder." })}
				</div>
			) : (
				<div style={{ display: "grid", gap: 10 }}>
					{list.map((row) => (
						<div
							key={row.resume_version_id}
							className="jobs-card jobs-card--interactive"
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: 8,
								alignItems: "center",
								padding: "12px 14px",
								borderRadius: JOBS_RADIUS.md,
								border: `1px solid ${row.is_default ? "color-mix(in srgb, #2563eb 45%, var(--color-border))" : "var(--color-border)"}`,
								background: row.is_default
									? "color-mix(in srgb, #2563eb 8%, var(--color-surface-raised))"
									: "var(--color-surface-raised)",
								boxShadow: "0 1px 0 color-mix(in srgb, var(--color-shadow) 18%, transparent)",
							}}
						>
							<div style={{ flex: "1 1 140px", minWidth: 0 }}>
								<div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, lineHeight: 1.35, color: "var(--color-text-primary)" }}>
									{row.label}
									{row.is_default ? (
										<span
											className="jobs-chip"
											style={{
												marginLeft: 8,
												fontSize: 11,
												fontWeight: 700,
												color: ACCENT,
												letterSpacing: "0.03em",
												textTransform: "uppercase",
											}}
										>
											{t("jobs.resumeVersions.default", { defaultValue: "Default" })}
										</span>
									) : null}
								</div>
								{isSafeHttpUrl(row.resume_url) && (
									<a
										href={row.resume_url}
										target="_blank"
										rel="noreferrer"
										style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: ACCENT, lineHeight: 1.4 }}
									>
										{t("jobs.resumeVersions.openPdf", { defaultValue: "Open PDF" })}
									</a>
								)}
							</div>
							<button
								type="button"
								className="jobs-btn"
								style={jobsBtnStyle({ compact: true, disabled: busy })}
								disabled={busy}
								onClick={() => onLoadVersion?.(row)}
							>
								{t("jobs.resumeVersions.load", { defaultValue: "Edit" })}
							</button>
							{!row.is_default && (
								<button
									type="button"
									className="jobs-btn"
									style={jobsBtnStyle({ compact: true, disabled: busy })}
									disabled={busy}
									onClick={() =>
										run(async () => {
											const updated = await updateResumeVersion(row.resume_version_id, { is_default: true });
											onChangeResumes?.(
												list.map((r) => ({
													...r,
													is_default: r.resume_version_id === updated.resume_version_id,
													...(r.resume_version_id === updated.resume_version_id ? updated : {}),
												})),
											);
										}, t("jobs.resumeVersions.defaultSet", { defaultValue: "Default version updated." }))
									}
								>
									{t("jobs.resumeVersions.makeDefault", { defaultValue: "Make default" })}
								</button>
							)}
							<button
								type="button"
								className="jobs-btn"
								style={{
									...jobsBtnStyle({ compact: true, disabled: busy }),
									borderColor: "color-mix(in srgb, #2563eb 40%, var(--color-border))",
									color: ACCENT,
								}}
								disabled={busy}
								onClick={() =>
									run(async () => {
										const res = await generateResumePdf({ resume_version_id: row.resume_version_id });
										if (res?.resume) {
											onChangeResumes?.(
												list.map((r) => (r.resume_version_id === res.resume.resume_version_id ? res.resume : r)),
											);
										}
										if (res?.url) onPdfUrl?.(res.url);
									}, t("jobs.resumeVersions.pdfReady", { defaultValue: "PDF generated." }))
								}
							>
								{t("jobs.resumeVersions.serverPdf", { defaultValue: "Generate PDF" })}
							</button>
							<button
								type="button"
								className="jobs-btn jobs-btn--danger"
								style={jobsBtnStyle({ danger: true, compact: true, disabled: busy })}
								disabled={busy}
								onClick={() =>
									run(async () => {
										await deleteResumeVersion(row.resume_version_id);
										onChangeResumes?.(list.filter((r) => r.resume_version_id !== row.resume_version_id));
									}, t("jobs.resumeVersions.deleted", { defaultValue: "Version deleted." }))
								}
							>
								{t("jobs.resumeVersions.remove", { defaultValue: "Delete" })}
							</button>
						</div>
					))}
				</div>
			)}

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
				<input
					className="jobs-input"
					style={jobsInputStyle({ flex: "1 1 160px", width: "auto" })}
					placeholder={t("jobs.resumeVersions.labelPlaceholder", { defaultValue: "Version name (e.g. Product)" })}
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					disabled={busy}
					aria-label={t("jobs.resumeVersions.labelPlaceholder", { defaultValue: "Version name (e.g. Product)" })}
				/>
				<button
					type="button"
					className="jobs-btn jobs-btn--primary"
					style={jobsBtnStyle({ primary: true, disabled: busy })}
					disabled={busy}
					onClick={() =>
						run(async () => {
							const created = await createResumeVersion({
								label: label || "Resume",
								resume_json: activeResumeJson,
								is_default: list.length === 0,
							});
							onChangeResumes?.(
								created.is_default
									? [created, ...list.map((r) => ({ ...r, is_default: false }))]
									: [created, ...list],
							);
							setLabel("");
						}, t("jobs.resumeVersions.saved", { defaultValue: "Version saved." }))
					}
				>
					{busy
						? t("jobs.resumeVersions.saving", { defaultValue: "Saving…" })
						: t("jobs.resumeVersions.saveVersion", { defaultValue: "Save as version" })}
				</button>
				<button
					type="button"
					className="jobs-btn"
					style={jobsBtnStyle({ disabled: busy })}
					disabled={busy}
					onClick={() =>
						run(async () => {
							const res = await generateResumePdf({});
							if (res?.url) onPdfUrl?.(res.url);
						}, t("jobs.resumeVersions.pdfReady", { defaultValue: "PDF generated." }))
					}
				>
					{t("jobs.resumeVersions.serverPdfProfile", { defaultValue: "Generate PDF (current)" })}
				</button>
			</div>
			{err && (
				<div className="jobs-feedback jobs-feedback--err" role="alert" style={jobsFeedbackTextStyle()}>
					{err}
				</div>
			)}
			{ok && !err && (
				<div className="jobs-feedback jobs-feedback--ok" role="status" style={jobsFeedbackTextStyle()}>
					{ok}
				</div>
			)}
		</div>
	);
}
