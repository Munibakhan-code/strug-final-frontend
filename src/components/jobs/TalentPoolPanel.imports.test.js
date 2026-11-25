/**
 * @vitest-environment node
 * Guard: TalentPoolPanel lives under src/components/jobs/ and must use ../../ for
 * api/hooks/utils (and ./ for sibling jobs components). A single ../ resolves under
 * src/components/ and breaks the employer Talent pool tab at runtime.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "TalentPoolPanel.jsx"),
	"utf8",
);

describe("TalentPoolPanel import paths", () => {
	it("reaches api/hooks/utils from src/ via ../../", () => {
		expect(src).toMatch(/from ["']\.\.\/\.\.\/api\/jobs/);
		expect(src).toMatch(/from ["']\.\.\/\.\.\/api\/chat/);
		expect(src).toMatch(/from ["']\.\.\/\.\.\/hooks\/usePageI18n/);
		expect(src).toMatch(/from ["']\.\.\/\.\.\/utils\/candidatePortfolio/);
		expect(src).toMatch(/from ["']\.\.\/\.\.\/utils\/safeUrl/);
	});

	it("does not use page-level ../api or ../components/jobs paths", () => {
		expect(src).not.toMatch(/from ["']\.\.\/api\//);
		expect(src).not.toMatch(/from ["']\.\.\/hooks\//);
		expect(src).not.toMatch(/from ["']\.\.\/utils\//);
		expect(src).not.toMatch(/from ["']\.\.\/components\/jobs\//);
	});

	it("imports sibling jobs modules with ./", () => {
		expect(src).toMatch(/from ["']\.\/PortfolioGallery/);
		expect(src).toMatch(/from ["']\.\/StructuredResumeSummary/);
		expect(src).toMatch(/from ["']\.\/jobsLayout/);
	});
});
