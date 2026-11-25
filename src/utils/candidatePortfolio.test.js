/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	isPortfolioImage,
	normalizePortfolioList,
	portfolioItemLabel,
} from "./candidatePortfolio.js";

describe("isPortfolioImage", () => {
	it("true for media_type image", () => {
		expect(isPortfolioImage({ media_type: "image", url: "https://x" })).toBe(true);
	});

	it("true for image URL extension", () => {
		expect(isPortfolioImage({ url: "https://cdn/a.PNG" })).toBe(true);
	});

	it("false for pdf", () => {
		expect(isPortfolioImage({ media_type: "pdf", url: "https://cdn/a.pdf" })).toBe(false);
	});
});

describe("portfolioItemLabel", () => {
	it("prefers title", () => {
		expect(portfolioItemLabel({ title: " Case ", media_type: "image" })).toBe("Case");
	});

	it("falls back by type", () => {
		expect(portfolioItemLabel({ media_type: "pdf" })).toBe("PDF sample");
	});
});

describe("normalizePortfolioList", () => {
	it("handles empty", () => {
		expect(normalizePortfolioList(null)).toEqual([]);
		expect(normalizePortfolioList({})).toEqual([]);
	});

	it("reads nested portfolio arrays", () => {
		expect(normalizePortfolioList({
			portfolio: [{ url: "https://a" }, { title: "no url" }],
		})).toHaveLength(1);
	});
});
