/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	JOB_APPLICATION_CHAT_CONTEXT,
	canOpenJobApplicationChat,
	jobApplicationChatId,
	buildJobApplicationChatIntro,
} from "./jobMessaging.js";

describe("jobMessaging helpers", () => {
	it("exposes the job_application context key", () => {
		expect(JOB_APPLICATION_CHAT_CONTEXT).toBe("job_application");
	});

	it("gates chat open on a positive application id", () => {
		expect(canOpenJobApplicationChat({ job_application_id: 12 })).toBe(true);
		expect(canOpenJobApplicationChat(12)).toBe(true);
		expect(canOpenJobApplicationChat({ job_application_id: 0 })).toBe(false);
		expect(canOpenJobApplicationChat(null)).toBe(false);
		expect(jobApplicationChatId({ job_application_id: 7 })).toBe(7);
		expect(jobApplicationChatId({})).toBeNull();
	});

	it("builds employer and applicant intro lines", () => {
		expect(buildJobApplicationChatIntro({
			role: "employer",
			jobName: "Backend Engineer",
			candidateName: "Sam",
		})).toContain("Backend Engineer");
		expect(buildJobApplicationChatIntro({
			role: "employer",
			jobName: "Backend Engineer",
			candidateName: "Sam",
		})).toContain("Sam");
		expect(buildJobApplicationChatIntro({
			role: "applicant",
			jobName: "Backend Engineer",
			companyName: "Acme",
		})).toMatch(/Acme/);
	});
});
