/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { requireChatChannelId } from "./chat.js";

describe("requireChatChannelId", () => {
	it("returns the channel id on a normal DM open", () => {
		expect(requireChatChannelId({ channel_id: 12 })).toBe(12);
	});

	it("rejects missing or empty channel_id so Message is not a dead button", () => {
		expect(() => requireChatChannelId(null)).toThrow(/conversation/i);
		expect(() => requireChatChannelId({})).toThrow(/conversation/i);
		expect(() => requireChatChannelId({ channel_id: "" })).toThrow(/conversation/i);
	});

	it("surfaces the API message when present", () => {
		expect(() => requireChatChannelId({ message: "You cannot message this user" })).toThrow("You cannot message this user");
	});
});
