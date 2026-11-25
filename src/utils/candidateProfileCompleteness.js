/**
 * Jobs seeker profile completeness — drives Easy Apply prompts and drawer activity hints.
 */

import { hasResumeJsonContent } from "./resumeBuilder.js";

const FIELDS = [
	{ key: "headline", weight: 15, filled: (c) => Boolean(String(c?.headline ?? "").trim()) },
	{ key: "bio", weight: 15, filled: (c) => Boolean(String(c?.bio ?? "").trim()) },
	{ key: "skills", weight: 15, filled: (c) => Boolean(String(c?.skills ?? "").trim()) },
	{ key: "location", weight: 10, filled: (c) => Boolean(String(c?.location ?? "").trim()) },
	{ key: "resume_url", weight: 25, filled: (c) => Boolean(String(c?.resume_url ?? "").trim()) },
	{ key: "resume_structured", weight: 10, filled: (c) => hasResumeJsonContent(c?.resume_json) },
	{ key: "years_experience", weight: 10, filled: (c) => c?.years_experience != null && String(c.years_experience).trim() !== "" },
	{ key: "desired_salary", weight: 5, filled: (c) => c?.desired_salary != null && String(c.desired_salary).trim() !== "" },
];

/**
 * @param {object|null|undefined} candidate
 * @returns {{ percent: number, missing: string[], complete: boolean }}
 */
export function profileCompleteness(candidate) {
	if (!candidate || typeof candidate !== "object") {
		return { percent: 0, missing: FIELDS.map((f) => f.key), complete: false };
	}
	let earned = 0;
	const missing = [];
	for (const field of FIELDS) {
		if (field.filled(candidate)) {
			earned += field.weight;
		} else {
			missing.push(field.key);
		}
	}
	const percent = Math.min(100, Math.round(earned));
	return { percent, missing, complete: percent >= 100 };
}

/** Résumé is the gate for Easy Apply — highlight when absent even if other fields exist. */
export function needsResumeAttention(candidate) {
	return !String(candidate?.resume_url ?? "").trim();
}
