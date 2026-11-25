/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { mapTownHallPoll, quotedPostApiId, townHallFollowLabel } from "./townHallPostMap.js";

describe("mapTownHallPoll", () => {
	it("keeps voted_option_id from the API poll payload", () => {
		const poll = mapTownHallPoll({
			poll: {
				voted_option_id: 3,
				total_votes: 10,
				options: [{ option_id: 3, text: "Yes", votes_count: 7 }],
			},
		});
		expect(poll.voted_option_id).toBe(3);
		expect(poll.options[0].text).toBe("Yes");
	});

	it("does not invent a vote when the API omitted one", () => {
		expect(mapTownHallPoll({ poll_options: [{ option_id: 1, option_text: "A", votes_count: 0 }] }).voted_option_id).toBe(null);
		expect(mapTownHallPoll(null)).toBe(null);
		expect(mapTownHallPoll({})).toBe(null);
	});
});

describe("quotedPostApiId", () => {
	it("returns the quoted post id for hydrate-on-tap", () => {
		expect(quotedPostApiId({ id: 88, text: "hi" })).toBe(88);
	});

	it("skips text-only quotes and empty stubs", () => {
		expect(quotedPostApiId({ _fromText: true, text: "hi" })).toBe(null);
		expect(quotedPostApiId({ id: "" })).toBe(null);
		expect(quotedPostApiId(null)).toBe(null);
	});
});

describe("townHallFollowLabel", () => {
	const t = (k, d) => ({ "common.follow": "Follow", "common.following": "Following", "social.requested": "Requested" }[k] || d);
	it("says Follow when not following", () => {
		expect(townHallFollowLabel(false, t)).toBe("Follow");
		expect(townHallFollowLabel(undefined, t)).toBe("Follow");
	});
	it("does not say Follow when already following or requested", () => {
		expect(townHallFollowLabel(true, t)).toBe("Following");
		expect(townHallFollowLabel("requested", t)).toBe("Requested");
	});
});
