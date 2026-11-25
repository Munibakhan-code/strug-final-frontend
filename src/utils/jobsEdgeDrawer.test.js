/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	JOBS_DRAWER_TAB_IDS,
	mapApplicationToDrawerItem,
	mapJobAlertToDrawerItem,
	stackJobsEdgeTabTop,
} from "./jobsEdgeDrawer.js";
import {
	AI_FAB_CENTER_OFFSET_PX,
	AI_FAB_HEIGHT_PX,
	EDGE_TAB_CLEARANCE_PX,
} from "./verticalEdgeDrawerConfig.js";

function parseStackOffset(top) {
	const m = String(top).match(/calc\(50%\s*([+-])\s*(\d+(?:\.\d+)?)px\)/);
	if (!m) return null;
	const n = Number(m[2]);
	return m[1] === "-" ? -n : n;
}

describe("stackJobsEdgeTabTop", () => {
	it("never returns literal 50%", () => {
		for (let i = 0; i < JOBS_DRAWER_TAB_IDS.length; i += 1) {
			expect(stackJobsEdgeTabTop(i)).not.toBe("50%");
		}
	});

	it("keeps four Jobs tabs clear of the Strug AI fab band", () => {
		const deadTop = AI_FAB_CENTER_OFFSET_PX - AI_FAB_HEIGHT_PX / 2 - EDGE_TAB_CLEARANCE_PX;
		const deadBottom = AI_FAB_CENTER_OFFSET_PX + AI_FAB_HEIGHT_PX / 2 + EDGE_TAB_CLEARANCE_PX;
		const tabHeight = 92;
		const total = JOBS_DRAWER_TAB_IDS.length;

		for (let i = 0; i < total; i += 1) {
			const top = parseStackOffset(stackJobsEdgeTabTop(i, total));
			expect(top).not.toBeNull();
			const bottom = top + tabHeight;
			expect(bottom <= deadTop || top >= deadBottom).toBe(true);
		}
	});
});

describe("mapApplicationToDrawerItem", () => {
	it("uses jobs relation and job_application_id from API", () => {
		const row = mapApplicationToDrawerItem({
			job_application_id: 12,
			status: "applied",
			jobs: { job_id: 99, job_name: "Backend Dev" },
		});
		expect(row.id).toBe(12);
		expect(row.title).toBe("Backend Dev");
		expect(row.target).toEqual({ jobId: 99 });
	});
});

describe("mapJobAlertToDrawerItem", () => {
	it("uses saved_search_id from backend", () => {
		const row = mapJobAlertToDrawerItem({ saved_search_id: 7, name: "Remote React" });
		expect(row.id).toBe(7);
		expect(row.title).toBe("Remote React");
	});
});
