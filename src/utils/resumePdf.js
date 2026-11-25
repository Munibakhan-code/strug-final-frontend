/**
 * Client-side PDF export from structured résumé (resume_json).
 * Mirrors invoice.js: dynamic jsPDF import.
 */

import { hasResumeJsonContent, parseResumeJson } from "./resumeBuilder.js";

function lineY(doc, y, maxY) {
	if (y > maxY) {
		doc.addPage();
		return 20;
	}
	return y;
}

/**
 * @param {unknown} resumeJson
 * @param {{ name?: string, headline?: string }=} profile
 */
export async function downloadResumePdf(resumeJson, profile = {}) {
	const resume = parseResumeJson(resumeJson);
	if (!hasResumeJsonContent(resume) && !String(profile.headline || "").trim()) {
		throw new Error("Add summary, experience, or education before exporting.");
	}

	const { jsPDF } = await import("jspdf");
	const doc = new jsPDF({ unit: "mm", format: "a4" });
	const pageW = doc.internal.pageSize.getWidth();
	const M = 18;
	const maxY = doc.internal.pageSize.getHeight() - 18;
	const ink = [17, 17, 17];
	const muted = [100, 100, 100];
	const accent = [37, 99, 235];

	let y = 22;
	const name = String(profile.name || "").trim() || "Résumé";
	doc.setFont("helvetica", "bold");
	doc.setFontSize(20);
	doc.setTextColor(...ink);
	doc.text(name, M, y);
	y += 8;

	if (profile.headline) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(11);
		doc.setTextColor(...muted);
		doc.text(String(profile.headline).slice(0, 120), M, y);
		y += 8;
	}

	doc.setDrawColor(...accent);
	doc.setLineWidth(0.6);
	doc.line(M, y, pageW - M, y);
	y += 10;

	const section = (title) => {
		y = lineY(doc, y + 2, maxY);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(12);
		doc.setTextColor(...accent);
		doc.text(title.toUpperCase(), M, y);
		y += 6;
		doc.setTextColor(...ink);
	};

	if (resume.summary) {
		section("Summary");
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		const lines = doc.splitTextToSize(resume.summary, pageW - M * 2);
		for (const line of lines) {
			y = lineY(doc, y, maxY);
			doc.text(line, M, y);
			y += 5;
		}
		y += 4;
	}

	if (resume.experience.length) {
		section("Experience");
		for (const row of resume.experience) {
			y = lineY(doc, y, maxY);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.text([row.title, row.company].filter(Boolean).join(" · ") || "Role", M, y);
			y += 5;
			const dates = [row.start, row.current ? "Present" : row.end].filter(Boolean).join(" – ");
			if (dates) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(9);
				doc.setTextColor(...muted);
				doc.text(dates, M, y);
				doc.setTextColor(...ink);
				y += 5;
			}
			if (row.description) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(10);
				const lines = doc.splitTextToSize(row.description, pageW - M * 2);
				for (const line of lines) {
					y = lineY(doc, y, maxY);
					doc.text(line, M, y);
					y += 4.5;
				}
			}
			y += 4;
		}
	}

	if (resume.education.length) {
		section("Education");
		for (const row of resume.education) {
			y = lineY(doc, y, maxY);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.text([row.school, row.degree].filter(Boolean).join(" · ") || "Education", M, y);
			y += 5;
			const detail = [row.field, row.end].filter(Boolean).join(" · ");
			if (detail) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(9);
				doc.setTextColor(...muted);
				doc.text(detail, M, y);
				doc.setTextColor(...ink);
				y += 5;
			}
			y += 3;
		}
	}

	const fileBase = (profile.name || "resume").replace(/[^\w.-]+/g, "_").slice(0, 40);
	doc.save(`${fileBase || "resume"}.pdf`);
}
