/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	emptyResumeJson,
	parseResumeJson,
	normalizeResumeJson,
	hasResumeJsonContent,
	formatExperienceLine,
	resumePreviewLines,
} from "./resumeBuilder.js";

describe("parseResumeJson", () => {
	it("returns empty shape for null", () => {
		expect(parseResumeJson(null)).toEqual(emptyResumeJson());
	});

	it("parses object payload", () => {
		const r = parseResumeJson({
			summary: "Summary",
			experience: [{ title: "Engineer", company: "Strug" }],
			education: [],
		});
		expect(r.summary).toBe("Summary");
		expect(r.experience[0].title).toBe("Engineer");
	});

	it("rejects malformed JSON string", () => {
		expect(parseResumeJson("{not json")).toEqual(emptyResumeJson());
	});

	it("drops blank experience rows", () => {
		const r = parseResumeJson({ experience: [{ title: "", company: "" }, { title: "Dev", company: "X" }] });
		expect(r.experience).toHaveLength(1);
	});
});

describe("formatExperienceLine", () => {
	it("joins title and company", () => {
		expect(formatExperienceLine({ title: "Dev", company: "Strug" })).toBe("Dev at Strug");
	});

	it("returns empty for missing fields", () => {
		expect(formatExperienceLine({})).toBe("");
	});
});

describe("resumePreviewLines", () => {
	it("includes summary and experience", () => {
		const lines = resumePreviewLines({
			summary: "Hello",
			experience: [{ title: "PM", company: "Acme" }],
			education: [],
		});
		expect(lines[0]).toBe("Hello");
		expect(lines[1]).toBe("PM at Acme");
	});
});

describe("hasResumeJsonContent", () => {
	it("is false when empty", () => {
		expect(hasResumeJsonContent(emptyResumeJson())).toBe(false);
	});

	it("is true with education only", () => {
		expect(hasResumeJsonContent({ education: [{ school: "MIT" }] })).toBe(true);
	});
});

describe("normalizeResumeJson", () => {
	it("caps oversized summary", () => {
		const r = normalizeResumeJson({ summary: "a".repeat(5000) });
		expect(r.summary.length).toBe(4000);
	});
});
