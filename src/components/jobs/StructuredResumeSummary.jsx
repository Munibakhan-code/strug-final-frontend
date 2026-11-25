import { JOBS_FONT as FONT } from "./jobsLayout.js";
import {
	formatEducationLine,
	formatExperienceLine,
	hasResumeJsonContent,
	parseResumeJson,
} from "../../utils/resumeBuilder.js";

const label = {
	fontSize: 12,
	fontWeight: 600,
	color: "var(--color-text-secondary)",
	letterSpacing: "0.04em",
	textTransform: "uppercase",
};

/** Read-only structured résumé block for employer ATS. */
export default function StructuredResumeSummary({ resumeJson }) {
	if (!hasResumeJsonContent(resumeJson)) return null;
	const resume = parseResumeJson(resumeJson);

	return (
		<div
			style={{
				border: "1px solid var(--color-border)",
				borderRadius: 10,
				padding: "12px 14px",
				background: "var(--color-surface-raised)",
			}}
		>
			<div style={{ ...label, marginBottom: 8 }}>Structured résumé</div>
			{resume.summary && (
				<p style={{ fontFamily: FONT, fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>
					{resume.summary}
				</p>
			)}
			{resume.experience.length > 0 && (
				<ul style={{ margin: "0 0 10px", paddingLeft: 18, fontFamily: FONT, fontSize: 13, color: "var(--color-text-primary)" }}>
					{resume.experience.map((row) => (
						<li key={row.id} style={{ marginBottom: 4 }}>
							{formatExperienceLine(row)}
							{row.current && <span style={{ color: "var(--color-text-muted)" }}> · Current</span>}
						</li>
					))}
				</ul>
			)}
			{resume.education.length > 0 && (
				<ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONT, fontSize: 13, color: "var(--color-text-primary)" }}>
					{resume.education.map((row) => (
						<li key={row.id}>{formatEducationLine(row)}</li>
					))}
				</ul>
			)}
		</div>
	);
}
