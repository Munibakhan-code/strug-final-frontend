/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { profileCompleteness, needsResumeAttention } from "./candidateProfileCompleteness.js";

describe("profileCompleteness", () => {
	it("returns zero for null candidate", () => {
		const r = profileCompleteness(null);
		expect(r.percent).toBe(0);
		expect(r.complete).toBe(false);
		expect(r.missing).toContain("resume_url");
	});

	it("counts a full profile at 100%", () => {
		const r = profileCompleteness({
			headline: "Engineer",
			bio: "About",
			skills: "JS",
			location: "Toronto",
			resume_url: "https://cdn.example/r.pdf",
			resume_json: { summary: "Builder", experience: [{ title: "Dev", company: "Co" }] },
			years_experience: 5,
			desired_salary: 90000,
		});
		expect(r.percent).toBe(100);
		expect(r.complete).toBe(true);
		expect(r.missing).toEqual([]);
	});

	it("treats empty strings as missing", () => {
		const r = profileCompleteness({
			headline: "  ",
			bio: "",
			skills: "React",
			resume_url: "https://cdn.example/r.pdf",
		});
		expect(r.missing).toContain("headline");
		expect(r.missing).toContain("bio");
		expect(r.percent).toBeLessThan(100);
	});

	it("weights resume_url heavily", () => {
		const without = profileCompleteness({ headline: "Dev", bio: "x", skills: "a", location: "y" });
		const withResume = profileCompleteness({
			headline: "Dev",
			bio: "x",
			skills: "a",
			location: "y",
			resume_url: "https://cdn.example/r.pdf",
		});
		expect(withResume.percent - without.percent).toBe(25);
	});

	it("counts structured resume_json toward completeness", () => {
		const r = profileCompleteness({
			headline: "Dev",
			resume_json: { summary: "Builder", experience: [{ title: "Eng", company: "Co" }] },
		});
		expect(r.missing).not.toContain("resume_structured");
		expect(r.percent).toBe(25);
	});
});

describe("needsResumeAttention", () => {
	it("is true when resume_url is missing", () => {
		expect(needsResumeAttention({ headline: "Dev" })).toBe(true);
	});

	it("is false when resume_url is set", () => {
		expect(needsResumeAttention({ resume_url: "https://cdn.example/r.pdf" })).toBe(false);
	});
});
