import { describe, it, expect, beforeEach } from "vitest";
import {
	asArray,
	applyDrawerItemHandoff,
	filterActiveFoodOrders,
	mapApplicationToDrawerItem,
	mapBookingToDrawerItem,
	mapCloseFriendRow,
	mapSaveToDrawerItem,
	mapSocialBookmarkRow,
	mapTempstayRecentRow,
	mapVaultDrawerRow,
	readJsonStorage,
	readSessionJson,
	STORAGE_KEYS,
} from "./verticalEdgeDrawerData.js";

describe("verticalEdgeDrawerData helpers", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("asArray normalizes list payloads", () => {
		expect(asArray([1, 2])).toEqual([1, 2]);
		expect(asArray({ data: [3] })).toEqual([3]);
		expect(asArray(null)).toEqual([]);
	});

	it("readJsonStorage returns fallback on missing or invalid JSON", () => {
		expect(readJsonStorage("missing", [])).toEqual([]);
		localStorage.setItem("bad", "{not json");
		expect(readJsonStorage("bad", [])).toEqual([]);
	});

	it("readJsonStorage parses stored arrays", () => {
		localStorage.setItem(STORAGE_KEYS.tempstayRecent, JSON.stringify([{ id: 1, title: "Cabin" }]));
		expect(readJsonStorage(STORAGE_KEYS.tempstayRecent, [])).toHaveLength(1);
	});

	it("readSessionJson reads active food session", () => {
		sessionStorage.setItem(STORAGE_KEYS.foodActive, JSON.stringify({ orderId: 99 }));
		expect(readSessionJson(STORAGE_KEYS.foodActive, null)?.orderId).toBe(99);
	});

	it("filterActiveFoodOrders excludes delivered and cancelled", () => {
		const orders = [
			{ id: 1, status: "preparing" },
			{ id: 2, status: "delivered" },
			{ id: 3, order_status: "cancelled" },
		];
		expect(filterActiveFoodOrders(orders).map((o) => o.id)).toEqual([1]);
	});

	it("filterActiveFoodOrders treats empty status as inactive", () => {
		expect(filterActiveFoodOrders([{ id: 1, status: "" }])).toEqual([]);
	});

	it("readJsonStorage rejects non-array JSON", () => {
		localStorage.setItem("obj", JSON.stringify({ id: 1 }));
		expect(readJsonStorage("obj", [])).toEqual([]);
	});

	it("readSessionJson returns fallback when storage throws", () => {
		const broken = { getItem: () => { throw new Error("blocked"); } };
		expect(readSessionJson("k", null, broken)).toBe(null);
	});
	it("mapTempstayRecentRow sets nav and listing handoff target", () => {
		const row = mapTempstayRecentRow({ id: 5, name: "Lake house", location: "Banff" });
		expect(row.title).toBe("Lake house");
		expect(row.nav).toBe("tempstay");
		expect(row.target).toEqual({ listingId: 5 });
	});

	it("mapSocialBookmarkRow maps town hall and feed posts", () => {
		const th = mapSocialBookmarkRow({ post_id: 9, content: "Hello town hall", user: { name: "Ada" } }, "social");
		expect(th.nav).toBe("social");
		expect(th.target).toEqual({ townHallPostId: 9 });
		expect(th.title).toBe("Hello town hall");

		const feed = mapSocialBookmarkRow({ social_post_id: 3, caption_text: "Photo day" }, "feed");
		expect(feed.target).toEqual({ feedPostId: 3 });
	});

	it("mapCloseFriendRow includes profile handoff", () => {
		const row = mapCloseFriendRow({ profile_id: 2, user_id: 55, display_name: "Sam", handle: "sam" });
		expect(row.title).toBe("Sam");
		expect(row.target).toEqual({ profileUserId: 55 });
	});

	it("mapVaultDrawerRow respects stored vertical", () => {
		expect(mapVaultDrawerRow({ id: 1, title: "Secret", vertical: "feed" }, "social").target)
			.toEqual({ feedPostId: 1 });
	});

	it("mapSaveToDrawerItem maps entity types to vertical nav", () => {
		expect(mapSaveToDrawerItem({ entity_type: "stay", entity_id: 9, meta: { title: "Cabin" } }))
			.toEqual({ id: 9, title: "Cabin", sub: undefined, nav: "tempstay", target: { listingId: 9 } });
		expect(mapSaveToDrawerItem({ entity_type: "restaurant", entity_id: 2, meta: { title: "Pizza" } }).nav)
			.toBe("food");
		expect(mapSaveToDrawerItem({ entity_type: "product", entity_id: 3 }).nav).toBe("shop");
		expect(mapSaveToDrawerItem({ entity_type: "venue", entity_id: 4 }).nav).toBe("venues");
		expect(mapSaveToDrawerItem({ entity_type: "unknown", entity_id: 5 }).nav).toBe("favourites");
	});

	it("mapApplicationToDrawerItem uses jobs relation and job handoff target", () => {
		const row = mapApplicationToDrawerItem({
			job_application_id: 10,
			status: "applied",
			jobs: { job_id: 42, job_name: "Barista" },
		});
		expect(row.title).toBe("Barista");
		expect(row.target).toEqual({ jobId: 42 });
	});

	it("mapBookingToDrawerItem includes tempstay listing handoff", () => {
		const row = mapBookingToDrawerItem({ id: 1, listing: { id: 77, title: "Loft" } });
		expect(row.target).toEqual({ listingId: 77 });
	});

	it("applyDrawerItemHandoff dispatches notification target for jobs and tempstay", () => {
		const events = [];
		const handler = () => events.push("notify");
		window.addEventListener("strug:open-notification-target", handler);
		applyDrawerItemHandoff({ target: { jobId: 5 } });
		expect(window.__jobsOpenJobId).toBe(5);
		expect(events).toEqual(["notify"]);
		delete window.__jobsOpenJobId;
		applyDrawerItemHandoff({ target: { listingId: "abc" } });
		expect(window.__tempstayOpenListingId).toBe("abc");
		expect(events).toEqual(["notify", "notify"]);
		window.removeEventListener("strug:open-notification-target", handler);
		delete window.__tempstayOpenListingId;
	});
});

describe("loadEdgeDrawerTabData recent tabs", () => {
	it("loads tempstay recent from localStorage without auth", async () => {
		const { loadEdgeDrawerTabData } = await import("./verticalEdgeDrawerData.js");
		localStorage.setItem(STORAGE_KEYS.tempstayRecent, JSON.stringify([
			{ id: 5, name: "Lake house" },
		]));
		const result = await loadEdgeDrawerTabData("tempstay", "recent");
		expect(result.items[0].title).toBe("Lake house");
		expect(result.items[0].nav).toBe("tempstay");
		expect(result.items[0].target).toEqual({ listingId: 5 });
	});
});
