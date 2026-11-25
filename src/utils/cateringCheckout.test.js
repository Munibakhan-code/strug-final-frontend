/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
	CATERING_PAYMENT_PROMO_VERTICAL,
	amountsDiffer,
	resolveChargedTotal,
} from "./cateringCheckout.js";

describe("cateringCheckout", () => {
	it("uses food vertical for promo so Apply matches commerce payment pricing", () => {
		expect(CATERING_PAYMENT_PROMO_VERTICAL).toBe("food");
	});

	it("resolveChargedTotal prefers finite server amount", () => {
		expect(resolveChargedTotal(40, 47.5)).toBe(47.5);
		expect(resolveChargedTotal(40, null)).toBe(40);
		expect(resolveChargedTotal(40, undefined)).toBe(40);
		expect(resolveChargedTotal(40, Number.NaN)).toBe(40);
	});

	it("amountsDiffer treats missing server amount as no change", () => {
		expect(amountsDiffer(40, null)).toBe(false);
		expect(amountsDiffer(40, 40.01)).toBe(false);
		expect(amountsDiffer(40, 47.5)).toBe(true);
		expect(amountsDiffer(undefined, 10)).toBe(true);
	});
});
