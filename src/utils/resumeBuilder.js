/**
 * Structured seeker résumé (candidate.resume_json) — Phase 3 builder.
 */

const MAX_EXPERIENCE = 25;
const MAX_EDUCATION = 15;
const MAX_SUMMARY_LEN = 4000;
const MAX_FIELD_LEN = 500;

export function emptyResumeJson() {
	return { summary: "", experience: [], education: [] };
}

function trimStr(value, max) {
	const text = String(value ?? "").trim();
	if (!text) return "";
	return text.length > max ? text.slice(0, max) : text;
}

function entryId(raw) {
	const id = String(raw ?? "").trim();
	if (id) return id.slice(0, 64);
	return `e_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {unknown} raw
 * @returns {{ summary: string, experience: object[], education: object[] }}
 */
export function parseResumeJson(raw) {
	if (raw == null) return emptyResumeJson();
	let value = raw;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return emptyResumeJson();
		try {
			value = JSON.parse(trimmed);
		} catch {
			return emptyResumeJson();
		}
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return emptyResumeJson();
	return normalizeResumeJson(value);
}

/**
 * @param {object} input
 */
export function normalizeResumeJson(input) {
	const summary = trimStr(input.summary, MAX_SUMMARY_LEN);

	const experience = Array.isArray(input.experience)
		? input.experience
				.slice(0, MAX_EXPERIENCE)
				.map((row) => ({
					id: entryId(row?.id),
					title: trimStr(row?.title, MAX_FIELD_LEN),
					company: trimStr(row?.company, MAX_FIELD_LEN),
					start: trimStr(row?.start, 32),
					end: trimStr(row?.end, 32),
					current: Boolean(row?.current),
					description: trimStr(row?.description, MAX_SUMMARY_LEN),
				}))
				.filter((row) => row.title || row.company)
		: [];

	const education = Array.isArray(input.education)
		? input.education
				.slice(0, MAX_EDUCATION)
				.map((row) => ({
					id: entryId(row?.id),
					school: trimStr(row?.school, MAX_FIELD_LEN),
					degree: trimStr(row?.degree, MAX_FIELD_LEN),
					field: trimStr(row?.field, MAX_FIELD_LEN),
					end: trimStr(row?.end, 32),
				}))
				.filter((row) => row.school || row.degree)
		: [];

	return { summary, experience, education };
}

/** @param {unknown} raw */
export function hasResumeJsonContent(raw) {
	const resume = parseResumeJson(raw);
	if (resume.summary) return true;
	if (resume.experience.length > 0) return true;
	if (resume.education.length > 0) return true;
	return false;
}

/** @param {object} exp */
export function formatExperienceLine(exp) {
	const title = String(exp?.title ?? "").trim();
	const company = String(exp?.company ?? "").trim();
	if (title && company) return `${title} at ${company}`;
	return title || company || "";
}

/** @param {object} edu */
export function formatEducationLine(edu) {
	const school = String(edu?.school ?? "").trim();
	const degree = String(edu?.degree ?? "").trim();
	const field = String(edu?.field ?? "").trim();
	const parts = [degree, field].filter(Boolean);
	if (school && parts.length) return `${parts.join(", ")} — ${school}`;
	return school || parts.join(", ") || "";
}

/**
 * Short lines for drawer preview.
 * @param {unknown} raw
 * @param {{ limit?: number }} [opts]
 */
export function resumePreviewLines(raw, opts = {}) {
	const limit = opts.limit ?? 3;
	const resume = parseResumeJson(raw);
	const lines = [];
	if (resume.summary) {
		const s = resume.summary.length > 100 ? `${resume.summary.slice(0, 97)}…` : resume.summary;
		lines.push(s);
	}
	for (const exp of resume.experience) {
		const line = formatExperienceLine(exp);
		if (line) lines.push(line);
		if (lines.length >= limit) return lines;
	}
	for (const edu of resume.education) {
		const line = formatEducationLine(edu);
		if (line) lines.push(line);
		if (lines.length >= limit) return lines;
	}
	return lines;
}

export function newExperienceEntry() {
	return {
		id: entryId(),
		title: "",
		company: "",
		start: "",
		end: "",
		current: false,
		description: "",
	};
}

export function newEducationEntry() {
	return {
		id: entryId(),
		school: "",
		degree: "",
		field: "",
		end: "",
	};
}
