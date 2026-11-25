/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { filterSavedTownHallPosts } from "./savedTownHallGrid.js";

const text = { id: 1, media_url: null, media_type: null };
const photo = { id: 2, media_url: "https://cdn/p.jpg", media_type: "image" };
const video = { id: 3, media_url: "https://cdn/v.mp4", media_type: "video" };

describe("filterSavedTownHallPosts", () => {
	it("keeps every bookmark on All", () => {
		expect(filterSavedTownHallPosts([text, photo, video], "all")).toEqual([text, photo, video]);
	});

	it("treats photo bookmarks as Post, not as missing media", () => {
		expect(filterSavedTownHallPosts([text, photo, video], "post").map((p) => p.id)).toEqual([1, 2]);
	});

	it("hides photos on Video and empty/malformed lists", () => {
		expect(filterSavedTownHallPosts([text, photo, video], "video")).toEqual([video]);
		expect(filterSavedTownHallPosts([text, photo, video], "photo")).toEqual([photo]);
		expect(filterSavedTownHallPosts(null, "post")).toEqual([]);
		expect(filterSavedTownHallPosts(undefined, "all")).toEqual([]);
		expect(filterSavedTownHallPosts([photo], "unknown")).toEqual([photo]);
	});
});
