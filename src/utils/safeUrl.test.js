/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { isSafeHttpUrl } from "./safeUrl.js";

describe("isSafeHttpUrl", () => {
	it("accepts http(s) links", () => {
		expect(isSafeHttpUrl("https://cdn.example/x/resume.pdf")).toBe(true);
		expect(isSafeHttpUrl("http://localhost:3000/file.pdf")).toBe(true);
	});

	it("rejects javascript, data, and empty values", () => {
		expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
		expect(isSafeHttpUrl("")).toBe(false);
		expect(isSafeHttpUrl(null)).toBe(false);
	});
});
