/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	normalizeContextTypeForOrigin,
	contextOriginLabel,
	getContextOriginDisplay,
} from "./chatContextOrigin.js";

const t = (key, opts) => opts?.defaultValue ?? key;

describe("normalizeContextTypeForOrigin", () => {
	it("maps marketplace to rental", () => {
		expect(normalizeContextTypeForOrigin("marketplace")).toBe("rental");
	});

	it("returns empty for dm and null", () => {
		expect(normalizeContextTypeForOrigin("dm")).toBe("");
		expect(normalizeContextTypeForOrigin(null)).toBe("");
	});

	it("keeps job_application key", () => {
		expect(normalizeContextTypeForOrigin("job_application")).toBe("job_application");
	});
});

describe("contextOriginLabel", () => {
	it("falls back to jobs label for job_application", () => {
		expect(contextOriginLabel("job_application", t)).toBe("Jobs");
	});
});

describe("getContextOriginDisplay", () => {
	it("returns label and glyph for food", () => {
		const d = getContextOriginDisplay("food", t);
		expect(d?.key).toBe("food");
		expect(d?.glyph).toBe("🍔");
	});

	it("returns null for plain dm", () => {
		expect(getContextOriginDisplay("dm", t)).toBeNull();
	});

	it("normalizes marketplace to rental display key", () => {
		const d = getContextOriginDisplay("marketplace", t);
		expect(d?.key).toBe("rental");
	});
});
