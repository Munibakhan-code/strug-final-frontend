/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const save = vi.fn();
const text = vi.fn();
const line = vi.fn();
const splitTextToSize = vi.fn((s) => [String(s).slice(0, 80)]);
const setFont = vi.fn();
const setFontSize = vi.fn();
const setTextColor = vi.fn();
const setDrawColor = vi.fn();
const setLineWidth = vi.fn();
const addPage = vi.fn();

vi.mock("jspdf", () => ({
	jsPDF: function MockJsPDF() {
		return {
			internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
			setFont,
			setFontSize,
			setTextColor,
			setDrawColor,
			setLineWidth,
			text,
			line,
			splitTextToSize,
			addPage,
			save,
		};
	},
}));

describe("downloadResumePdf", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects empty résumé", async () => {
		const { downloadResumePdf } = await import("./resumePdf.js");
		await expect(downloadResumePdf({})).rejects.toThrow(/Add summary/);
	});

	it("exports when summary present", async () => {
		const { downloadResumePdf } = await import("./resumePdf.js");
		await downloadResumePdf(
			{ summary: "Builder", experience: [], education: [] },
			{ name: "Sam", headline: "Eng" },
		);
		expect(save).toHaveBeenCalled();
		expect(String(save.mock.calls[0][0])).toMatch(/Sam\.pdf|resume\.pdf/i);
	});
});
