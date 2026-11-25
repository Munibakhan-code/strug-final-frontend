/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
	parseVenueCheckoutResumeQuery,
	parseVenueListingIdFromPath,
	venuePopstateAction,
} from "./venueNavigation.js";

describe("parseVenueListingIdFromPath", () => {
	it("reads id from listing venue path", () => {
		expect(parseVenueListingIdFromPath("/listing/venue/42-grand-hall")).toBe("42");
	});

	it("returns null for landing and unrelated paths", () => {
		expect(parseVenueListingIdFromPath("/venues")).toBeNull();
		expect(parseVenueListingIdFromPath("")).toBeNull();
		expect(parseVenueListingIdFromPath("/listing/host/9-cabin")).toBeNull();
	});
});

describe("venuePopstateAction", () => {
	it("closes to landing when path is not a venue listing", () => {
		expect(venuePopstateAction("/venues", 42)).toBe("landing");
	});

	it("returns same when selected venue already matches the URL id", () => {
		expect(venuePopstateAction("/listing/venue/42-hall", 42)).toBe("same");
		expect(venuePopstateAction("/listing/venue/42-hall", "42")).toBe("same");
	});

	it("returns openId when URL points at a different venue", () => {
		expect(venuePopstateAction("/listing/venue/99-loft", 42)).toEqual({ openId: "99" });
	});

	it("treats missing selection as needing open", () => {
		expect(venuePopstateAction("/listing/venue/7-x", null)).toEqual({ openId: "7" });
	});
});

describe("parseVenueCheckoutResumeQuery", () => {
	it("parses checkout resume params", () => {
		expect(parseVenueCheckoutResumeQuery("?checkout=1&eventDate=2026-10-01&attendees=12")).toEqual({
			eventDate: "2026-10-01",
			attendees: 12,
		});
	});

	it("rejects missing checkout or eventDate", () => {
		expect(parseVenueCheckoutResumeQuery("?eventDate=2026-10-01")).toBeNull();
		expect(parseVenueCheckoutResumeQuery("?checkout=1")).toBeNull();
		expect(parseVenueCheckoutResumeQuery("")).toBeNull();
	});

	it("floors invalid attendees at 1", () => {
		expect(parseVenueCheckoutResumeQuery("checkout=1&eventDate=2026-10-01&attendees=0").attendees).toBe(1);
		expect(parseVenueCheckoutResumeQuery("checkout=1&eventDate=2026-10-01&attendees=abc").attendees).toBe(1);
	});
});
