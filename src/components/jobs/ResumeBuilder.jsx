import { usePageI18n } from "../../hooks/usePageI18n.js";
import {
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
	newEducationEntry,
	newExperienceEntry,
	normalizeResumeJson,
	parseResumeJson,
	hasResumeJsonContent,
} from "../../utils/resumeBuilder.js";
import { downloadResumePdf } from "../../utils/resumePdf.js";
import { useState } from "react";

const sectionCard = {
	border: "1px solid var(--color-border)",
	borderRadius: JOBS_RADIUS.md,
	padding: "14px 16px",
	background: "var(--color-surface-raised)",
	boxShadow: "0 1px 0 color-mix(in srgb, var(--color-shadow) 16%, transparent)",
};

function Field({ label: lbl, children, style }) {
	return (
		<div style={style}>
			<div style={{ ...jobsSectionLabelStyle, marginBottom: 8 }}>{lbl}</div>
			{children}
		</div>
	);
}

/**
 * LinkedIn-style structured résumé editor (summary, experience, education).
 */
export default function ResumeBuilder({ value, onChange, profileName, profileHeadline }) {
	const { t } = usePageI18n("jobs");
	const resume = parseResumeJson(value);
	const [pdfBusy, setPdfBusy] = useState(false);
	const [pdfErr, setPdfErr] = useState(null);

	const patch = (partial) => {
		onChange?.(normalizeResumeJson({ ...resume, ...partial }));
	};

	const exportPdf = async () => {
		if (pdfBusy) return;
		setPdfBusy(true);
		setPdfErr(null);
		try {
			await downloadResumePdf(resume, {
				name: profileName,
				headline: profileHeadline,
			});
		} catch (e) {
			setPdfErr(e?.message || "Couldn't export PDF.");
		} finally {
			setPdfBusy(false);
		}
	};

	const updateExperience = (id, key, val) => {
		patch({
			experience: resume.experience.map((row) =>
				row.id === id ? { ...row, [key]: val } : row,
			),
		});
	};

	const updateEducation = (id, key, val) => {
		patch({
			education: resume.education.map((row) =>
				row.id === id ? { ...row, [key]: val } : row,
			),
		});
	};

	const removeExperience = (id) => {
		patch({ experience: resume.experience.filter((row) => row.id !== id) });
	};

	const removeEducation = (id) => {
		patch({ education: resume.education.filter((row) => row.id !== id) });
	};

	const canExport = hasResumeJsonContent(resume);

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
				<div style={{ flex: "1 1 220px", minWidth: 0 }}>
					<div style={{ ...jobsSectionLabelStyle, marginBottom: 8 }}>
						{t("jobs.resumeBuilder.title", { defaultValue: "Structured résumé" })}
					</div>
					<p style={jobsBlurbStyle}>
						{t("jobs.resumeBuilder.blurb", {
							defaultValue: "Add experience and education employers see when you apply. Upload a PDF below for Easy Apply.",
						})}
					</p>
				</div>
				<button
					type="button"
					className={`jobs-btn${canExport ? " jobs-btn--primary" : ""}`}
					style={jobsBtnStyle({ primary: canExport, disabled: pdfBusy || !canExport })}
					disabled={pdfBusy || !canExport}
					aria-busy={pdfBusy}
					onClick={exportPdf}
				>
					{pdfBusy
						? t("jobs.resumeBuilder.exporting", { defaultValue: "Exporting…" })
						: t("jobs.resumeBuilder.exportPdf", { defaultValue: "Export PDF" })}
				</button>
			</div>
			{pdfErr && (
				<div className="jobs-feedback jobs-feedback--err" role="alert" style={jobsFeedbackTextStyle()}>
					{pdfErr}
				</div>
			)}

			<Field label={t("jobs.resumeBuilder.summary", { defaultValue: "Professional summary" })}>
				<textarea
					className="jobs-input"
					style={jobsInputStyle({ minHeight: 90, resize: "vertical" })}
					value={resume.summary}
					onChange={(e) => patch({ summary: e.target.value })}
					placeholder={t("jobs.resumeBuilder.summaryPlaceholder", { defaultValue: "Brief overview of your experience and goals…" })}
				/>
			</Field>

			<div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
					<div style={jobsSectionLabelStyle}>{t("jobs.resumeBuilder.experience", { defaultValue: "Experience" })}</div>
					<button
						type="button"
						className="jobs-btn"
						style={jobsBtnStyle({ compact: true })}
						onClick={() => patch({ experience: [...resume.experience, newExperienceEntry()] })}
					>
						{t("jobs.resumeBuilder.addExperience", { defaultValue: "Add role" })}
					</button>
				</div>
				{resume.experience.length === 0 ? (
					<div className="jobs-empty" style={{ ...jobsEmptyStateStyle(), padding: "20px 14px" }} role="status">
						{t("jobs.resumeBuilder.noExperience", { defaultValue: "No roles yet." })}
					</div>
				) : (
					<div style={{ display: "grid", gap: 12 }}>
						{resume.experience.map((row) => (
							<div key={row.id} className="jobs-card" style={sectionCard}>
								<div style={{ display: "grid", gap: 12 }}>
									<Field label={t("jobs.resumeBuilder.jobTitle", { defaultValue: "Job title" })}>
										<input
											className="jobs-input"
											style={jobsInputStyle()}
											value={row.title}
											onChange={(e) => updateExperience(row.id, "title", e.target.value)}
											placeholder="Senior Software Engineer"
										/>
									</Field>
									<Field label={t("jobs.resumeBuilder.company", { defaultValue: "Company" })}>
										<input
											className="jobs-input"
											style={jobsInputStyle()}
											value={row.company}
											onChange={(e) => updateExperience(row.id, "company", e.target.value)}
											placeholder="Company name"
										/>
									</Field>
									<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
										<Field label={t("jobs.resumeBuilder.start", { defaultValue: "Start" })} style={{ flex: "1 1 120px" }}>
											<input
												className="jobs-input"
												style={jobsInputStyle()}
												value={row.start}
												onChange={(e) => updateExperience(row.id, "start", e.target.value)}
												placeholder="2020-01"
											/>
										</Field>
										<Field label={t("jobs.resumeBuilder.end", { defaultValue: "End" })} style={{ flex: "1 1 120px" }}>
											<input
												className="jobs-input"
												style={jobsInputStyle()}
												value={row.current ? "" : row.end}
												disabled={row.current}
												onChange={(e) => updateExperience(row.id, "end", e.target.value)}
												placeholder="2024-06"
											/>
										</Field>
									</div>
									<label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
										<input
											type="checkbox"
											checked={row.current}
											onChange={(e) => {
												const current = e.target.checked;
												updateExperience(row.id, "current", current);
												if (current) updateExperience(row.id, "end", "");
											}}
										/>
										{t("jobs.resumeBuilder.currentRole", { defaultValue: "I currently work here" })}
									</label>
									<Field label={t("jobs.resumeBuilder.description", { defaultValue: "Description" })}>
										<textarea
											className="jobs-input"
											style={jobsInputStyle({ minHeight: 72, resize: "vertical" })}
											value={row.description}
											onChange={(e) => updateExperience(row.id, "description", e.target.value)}
											placeholder={t("jobs.resumeBuilder.descriptionPlaceholder", { defaultValue: "Key wins, tools, and scope…" })}
										/>
									</Field>
									<button type="button" className="jobs-btn jobs-btn--danger" style={jobsBtnStyle({ danger: true, compact: true })} onClick={() => removeExperience(row.id)}>
										{t("jobs.resumeBuilder.remove", { defaultValue: "Remove" })}
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
					<div style={jobsSectionLabelStyle}>{t("jobs.resumeBuilder.education", { defaultValue: "Education" })}</div>
					<button
						type="button"
						className="jobs-btn"
						style={jobsBtnStyle({ compact: true })}
						onClick={() => patch({ education: [...resume.education, newEducationEntry()] })}
					>
						{t("jobs.resumeBuilder.addEducation", { defaultValue: "Add school" })}
					</button>
				</div>
				{resume.education.length === 0 ? (
					<div className="jobs-empty" style={{ ...jobsEmptyStateStyle(), padding: "20px 14px" }} role="status">
						{t("jobs.resumeBuilder.noEducation", { defaultValue: "No schools yet." })}
					</div>
				) : (
					<div style={{ display: "grid", gap: 12 }}>
						{resume.education.map((row) => (
							<div key={row.id} className="jobs-card" style={sectionCard}>
								<div style={{ display: "grid", gap: 12 }}>
									<Field label={t("jobs.resumeBuilder.school", { defaultValue: "School" })}>
										<input
											className="jobs-input"
											style={jobsInputStyle()}
											value={row.school}
											onChange={(e) => updateEducation(row.id, "school", e.target.value)}
											placeholder="University name"
										/>
									</Field>
									<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
										<Field label={t("jobs.resumeBuilder.degree", { defaultValue: "Degree" })} style={{ flex: "1 1 140px" }}>
											<input
												className="jobs-input"
												style={jobsInputStyle()}
												value={row.degree}
												onChange={(e) => updateEducation(row.id, "degree", e.target.value)}
												placeholder="BSc"
											/>
										</Field>
										<Field label={t("jobs.resumeBuilder.field", { defaultValue: "Field" })} style={{ flex: "1 1 140px" }}>
											<input
												className="jobs-input"
												style={jobsInputStyle()}
												value={row.field}
												onChange={(e) => updateEducation(row.id, "field", e.target.value)}
												placeholder="Computer Science"
											/>
										</Field>
									</div>
									<Field label={t("jobs.resumeBuilder.gradYear", { defaultValue: "End year" })}>
										<input
											className="jobs-input"
											style={jobsInputStyle()}
											value={row.end}
											onChange={(e) => updateEducation(row.id, "end", e.target.value)}
											placeholder="2022"
										/>
									</Field>
									<button type="button" className="jobs-btn jobs-btn--danger" style={jobsBtnStyle({ danger: true, compact: true })} onClick={() => removeEducation(row.id)}>
										{t("jobs.resumeBuilder.remove", { defaultValue: "Remove" })}
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
