/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	JOBS_INNER_MAX,
	JOBS_EDGE_RAIL_PAD,
	JOBS_RADIUS,
	jobsPageOuterStyle,
	jobsPageInnerStyle,
	jobsResultsGridStyle,
	jobsBtnStyle,
	jobsInputStyle,
	jobsPanelCardStyle,
	jobsEmptyStateStyle,
} from "./jobsLayout.js";

describe("jobsBtnStyle", () => {
	it("returns a ghost button by default", () => {
		const s = jobsBtnStyle();
		expect(s.background).toBe("transparent");
		expect(s.borderRadius).toBe(JOBS_RADIUS.md);
		expect(s.minHeight).toBe(40);
	});

	it("marks primary disabled with muted colors", () => {
		const s = jobsBtnStyle({ primary: true, disabled: true });
		expect(s.cursor).toBe("not-allowed");
		expect(s.opacity).toBe(0.55);
		expect(s.color).toBe("var(--color-text-muted)");
	});

	it("uses compact padding when compact is true", () => {
		expect(jobsBtnStyle({ compact: true }).minHeight).toBe(32);
		expect(jobsBtnStyle({}).minHeight).toBe(40);
	});
});

describe("jobsInputStyle / panel helpers", () => {
	it("merges extra input styles without dropping width", () => {
		const s = jobsInputStyle({ flex: "1 1 120px" });
		expect(s.width).toBe("100%");
		expect(s.flex).toBe("1 1 120px");
		expect(s.borderRadius).toBe(JOBS_RADIUS.sm);
	});

	it("highlights panel cards when requested", () => {
		const plain = jobsPanelCardStyle();
		const lit = jobsPanelCardStyle({ highlighted: true });
		expect(plain.border).toContain("var(--color-border)");
		expect(lit.border).toContain("2563eb");
	});

	it("empty state uses dashed border", () => {
		expect(jobsEmptyStateStyle().border).toContain("dashed");
	});
});

describe("jobsPageOuterStyle", () => {
	it("uses full width with edge-rail padding on desktop", () => {
		const s = jobsPageOuterStyle(false);
		expect(s.width).toBe("100%");
		expect(s.maxWidth).toBe("100%");
		expect(s.paddingLeft).toBe(108);
		expect(s.paddingRight).toBe(JOBS_EDGE_RAIL_PAD);
		expect(JOBS_EDGE_RAIL_PAD).toBeGreaterThanOrEqual(64);
	});

	it("uses compact padding on mobile", () => {
		const s = jobsPageOuterStyle(true);
		expect(s.paddingLeft).toBe(16);
		expect(s.paddingRight).toBe(16);
	});
});

describe("jobsPageInnerStyle", () => {
	it("caps desktop column at a wide board width", () => {
		const s = jobsPageInnerStyle(false);
		expect(s.width).toBe("100%");
		expect(s.maxWidth).toBe(JOBS_INNER_MAX);
		expect(JOBS_INNER_MAX).toBeGreaterThanOrEqual(1280);
	});

	it("does not invent a phone max-width on mobile", () => {
		expect(jobsPageInnerStyle(true).maxWidth).toBe("100%");
	});
});

describe("jobsResultsGridStyle", () => {
	it("is single column on mobile and tablet", () => {
		expect(jobsResultsGridStyle(true, false).gridTemplateColumns).toBe("1fr");
		expect(jobsResultsGridStyle(false, true).gridTemplateColumns).toBe("1fr");
	});

	it("is two columns on desktop wide", () => {
		expect(jobsResultsGridStyle(false, false).gridTemplateColumns).toBe(
			"repeat(2, minmax(0, 1fr))",
		);
	});
});
