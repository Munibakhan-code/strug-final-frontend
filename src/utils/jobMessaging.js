/**
 * Jobs Phase 4 — application messaging helpers (pure).
 */

export const JOB_APPLICATION_CHAT_CONTEXT = "job_application";

/** True when we have a numeric application id to open a context chat. */
export function canOpenJobApplicationChat(application) {
	const id = Number(application?.job_application_id ?? application);
	return Number.isFinite(id) && id > 0;
}

export function jobApplicationChatId(application) {
	const id = Number(application?.job_application_id ?? application);
	return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Optional first message when opening the thread from a CTA.
 * role: "employer" | "applicant"
 */
export function buildJobApplicationChatIntro({
	role = "employer",
	jobName,
	companyName,
	candidateName,
} = {}) {
	const job = String(jobName || "this role").trim() || "this role";
	if (role === "applicant") {
		const company = String(companyName || "the hiring team").trim() || "the hiring team";
		return `Hi — following up on my application for ${job} at ${company}.`;
	}
	const who = String(candidateName || "there").trim() || "there";
	return `Hi ${who} — thanks for applying to ${job}. Happy to answer questions here.`;
}
