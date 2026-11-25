import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	MIX_NAME,
	MIX_THRESHOLD,
	YOUR_MIX_NAME,
	isMixPlaylist,
	mixNameForCategory,
	normalizeCategory,
	sortPlaylistsForPicker,
	pendingMixesOf,
	recordListen,
	syncYourMix,
	markMixSynced,
	videoIdOf,
} from "./listenMix.js";

beforeEach(() => {
	localStorage.clear();
});

describe("mix naming", () => {
	it("uses Mix for blank or General, Mix · Category otherwise", () => {
		expect(mixNameForCategory("")).toBe("Mix");
		expect(mixNameForCategory("General")).toBe("Mix");
		expect(mixNameForCategory("Education")).toBe("Mix · Education");
		expect(mixNameForCategory("Music")).toBe("Mix · Music");
		expect(normalizeCategory("general")).toBe("");
	});

	it("treats Mix, Mix · X, and the legacy Your Mix name as mixes", () => {
		expect(isMixPlaylist("Mix")).toBe(true);
		expect(isMixPlaylist("Mix · Education")).toBe(true);
		expect(isMixPlaylist(YOUR_MIX_NAME)).toBe(true);
		expect(isMixPlaylist("Watch later")).toBe(false);
		expect(isMixPlaylist("Gym pump")).toBe(false);
	});

	it("puts Mix lists first in the save picker", () => {
		const sorted = sortPlaylistsForPicker([
			{ id: 1, name: "Gym" },
			{ id: 2, name: "Mix · Music" },
			{ id: 3, name: "Watch On A Plane" },
			{ id: 4, name: "Mix" },
		]);
		expect(sorted.map((p) => p.name)).toEqual(["Mix", "Mix · Music", "Gym", "Watch On A Plane"]);
	});

	it("saves with the numeric video_id, not a public-id string", () => {
		expect(videoIdOf({ video_id: 31, id: "p31abc" })).toBe(31);
		expect(videoIdOf({ id: "p31abc" })).toBeNull();
		expect(videoIdOf({ id: 31 })).toBe(31);
	});
});

describe("recordListen", () => {
	it("does not sync until a category has MIX_THRESHOLD distinct videos", () => {
		for (let i = 1; i < MIX_THRESHOLD; i += 1) {
			const s = recordListen({ id: i, title: `Edu ${i}`, category: "Education" });
			expect(s.shouldSync).toBe(false);
			expect(s.pendingMixes).toEqual([]);
		}
		const ready = recordListen({ id: MIX_THRESHOLD, title: "Edu last", category: "Education" });
		expect(ready.shouldSync).toBe(true);
		expect(ready.pendingMixes).toEqual([
			{ name: "Mix · Education", ids: [1, 2, 3, 4], unsynced: [1, 2, 3, 4] },
		]);
	});

	it("keeps education and music in separate pending mixes", () => {
		for (let i = 1; i <= MIX_THRESHOLD; i += 1) {
			recordListen({ id: i, title: `Edu ${i}`, category: "Education" });
		}
		for (let i = 1; i <= MIX_THRESHOLD; i += 1) {
			recordListen({ id: 100 + i, title: `Song ${i}`, category: "Music" });
		}
		const session = recordListen({ id: 1, title: "Edu 1 again", category: "Education" });
		const names = session.pendingMixes.map((g) => g.name).sort();
		expect(names).toEqual(["Mix · Education", "Mix · Music"]);
		expect(session.pendingMixes.find((g) => g.name === "Mix · Education").ids).toEqual([1, 2, 3, 4]);
		expect(session.pendingMixes.find((g) => g.name === "Mix · Music").ids).toEqual([101, 102, 103, 104]);
	});

	it("does not mix a short session of two types into one Mix", () => {
		recordListen({ id: 1, category: "Education" });
		recordListen({ id: 2, category: "Education" });
		recordListen({ id: 3, category: "Music" });
		const s = recordListen({ id: 4, category: "Music" });
		expect(s.shouldSync).toBe(false);
		expect(pendingMixesOf(s)).toEqual([]);
	});
});

describe("syncYourMix", () => {
	it("creates one playlist per category and never dumps music into education", async () => {
		const createPlaylist = vi.fn(async (name, videoId) => ({
			playlist_id: name.includes("Education") ? 10 : 11,
			name,
			videos: [{ video_id: videoId }],
		}));
		const addVideoToPlaylist = vi.fn(async (plId, videoId) => ({
			playlist_id: plId,
			name: plId === 10 ? "Mix · Education" : "Mix · Music",
			videos: [{ video_id: videoId }],
		}));
		const mapPlaylist = (pl) => ({ id: pl.playlist_id, name: pl.name, videos: (pl.videos || []).map((v) => ({ id: v.video_id })) });

		for (let i = 1; i <= MIX_THRESHOLD; i += 1) recordListen({ id: i, category: "Education" });
		for (let i = 1; i <= MIX_THRESHOLD; i += 1) recordListen({ id: 50 + i, category: "Music" });
		const session = recordListen({ id: 1, category: "Education" });

		const mixes = await syncYourMix({
			session,
			playlists: [],
			createPlaylist,
			addVideoToPlaylist,
			mapPlaylist,
		});
		expect(createPlaylist.mock.calls.map((c) => c[0]).sort()).toEqual(["Mix · Education", "Mix · Music"]);
		expect(mixes.map((m) => m.name).sort()).toEqual(["Mix · Education", "Mix · Music"]);
		const eduAdds = addVideoToPlaylist.mock.calls.filter((c) => c[0] === 10).map((c) => c[1]);
		const musicAdds = addVideoToPlaylist.mock.calls.filter((c) => c[0] === 11).map((c) => c[1]);
		expect(eduAdds.every((id) => id <= 4)).toBe(true);
		expect(musicAdds.every((id) => id >= 51)).toBe(true);
	});

	it("reuses an existing Mix · Education instead of creating a second one", async () => {
		const createPlaylist = vi.fn();
		const addVideoToPlaylist = vi.fn(async (_id, videoId) => ({
			playlist_id: 7,
			name: "Mix · Education",
			videos: [{ video_id: videoId }],
		}));
		const mapPlaylist = (pl) => ({ id: pl.playlist_id, name: pl.name, videos: (pl.videos || []).map((v) => ({ id: v.video_id })) });
		for (let i = 1; i <= MIX_THRESHOLD; i += 1) recordListen({ id: i, category: "Education" });
		const session = recordListen({ id: MIX_THRESHOLD, category: "Education" });
		await syncYourMix({
			session,
			playlists: [{ id: 7, name: "Mix · Education", videos: [{ id: 1 }] }],
			createPlaylist,
			addVideoToPlaylist,
			mapPlaylist,
		});
		expect(createPlaylist).not.toHaveBeenCalled();
		expect(addVideoToPlaylist).toHaveBeenCalled();
	});

	it("markMixSynced stops the same ids from syncing again", () => {
		for (let i = 1; i <= MIX_THRESHOLD; i += 1) recordListen({ id: i, category: "Education" });
		const session = recordListen({ id: MIX_THRESHOLD, category: "Education" });
		expect(session.shouldSync).toBe(true);
		markMixSynced(session, session.pendingMixes[0].ids);
		const again = recordListen({ id: 1, category: "Education" });
		expect(again.shouldSync).toBe(false);
	});
});

describe("legacy Your Mix", () => {
	it("is still recognised as a mix badge, but new auto lists use Mix", () => {
		expect(isMixPlaylist(YOUR_MIX_NAME)).toBe(true);
		expect(MIX_NAME).toBe("Mix");
		expect(mixNameForCategory("Education")).not.toBe(YOUR_MIX_NAME);
	});
});
