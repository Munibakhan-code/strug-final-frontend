import { describe, it, expect, beforeEach } from "vitest";
import {
	videoQueueId,
	readPlayQueue,
	writePlayQueue,
	addToPlayQueue,
	removeFromPlayQueue,
	shiftPlayQueue,
} from "./videoPlayQueue.js";

describe("videoPlayQueue", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("returns null for missing video id", () => {
		expect(videoQueueId(null)).toBeNull();
		expect(videoQueueId({})).toBeNull();
	});

	it("reads an empty queue when storage is missing", () => {
		expect(readPlayQueue()).toEqual([]);
	});

	it("adds a video and dedupes by id", () => {
		const a = { id: 1, title: "A" };
		const b = { videoId: 2, title: "B" };
		let q = addToPlayQueue([], a);
		q = addToPlayQueue(q, b);
		expect(q).toHaveLength(2);
		q = addToPlayQueue(q, { id: 1, title: "A again" });
		expect(q).toHaveLength(2);
		expect(videoQueueId(q[1])).toBe("1");
	});

	it("shifts the next item off the queue", () => {
		const q = [{ id: 9 }, { id: 10 }];
		const { next, rest } = shiftPlayQueue(q);
		expect(next).toEqual({ id: 9 });
		expect(rest).toEqual([{ id: 10 }]);
		expect(shiftPlayQueue([]).next).toBeNull();
	});

	it("removeFromPlayQueue drops one id", () => {
		const q = [{ id: 3 }, { id: 4 }];
		expect(removeFromPlayQueue(q, 3)).toEqual([{ id: 4 }]);
	});

	it("persists via sessionStorage", () => {
		writePlayQueue([{ id: 7, title: "Saved" }]);
		expect(readPlayQueue()).toEqual([{ id: 7, title: "Saved" }]);
	});

	it("treats malformed storage as empty", () => {
		sessionStorage.setItem("strug_video_play_queue", "{not-json");
		expect(readPlayQueue()).toEqual([]);
	});
});
