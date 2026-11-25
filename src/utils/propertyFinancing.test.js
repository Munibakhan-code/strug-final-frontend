import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildPropertyFinancingContext,
  preferredCategorySlug,
  buildFinancingFormPrefill,
  financingNotes,
} from "./propertyFinancing.js";

describe("propertyFinancing", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      store: {},
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds purchase context from a construct project", () => {
    const ctx = buildPropertyFinancingContext({
      id: 42,
      name: "Harbour Condos",
      city: "Toronto",
      location: "Harbourfront, Toronto, ON",
      priceNum: 750000,
      category: "Condos",
    }, "preconstruct");
    expect(ctx.property_id).toBe(42);
    expect(ctx.city).toBe("Toronto");
    expect(ctx.price).toBe(750000);
    expect(ctx.down_payment).toBe(50000);
    expect(ctx.property_type).toBe("Condo");
    expect(ctx.step).toBe("mortgage");
    expect(preferredCategorySlug("mortgage", ctx)).toBe("mortgage-new-purchase");
    expect(preferredCategorySlug("insurance", ctx)).toBe("home-insurance");
  });

  it("routes rentals to insurance", () => {
    const ctx = buildPropertyFinancingContext({
      id: 9,
      name: "King St Apt",
      location: "Toronto, ON",
      price: 2400,
      category: "For Rent",
      _kind: "rental",
    }, "realestate");
    expect(ctx.isRental).toBe(true);
    expect(ctx.step).toBe("insurance");
    expect(preferredCategorySlug("insurance", ctx)).toBe("renters-insurance");
  });

  it("prefills mortgage new-purchase form keys", () => {
    const cat = {
      form_schema: [
        { key: "property_type" },
        { key: "property_price" },
        { key: "down_payment" },
      ],
    };
    const form = buildFinancingFormPrefill(cat, {
      property_type: "Condo",
      price: 500000,
      down_payment: 100000,
    });
    expect(form).toEqual({
      property_type: "Condo",
      property_price: "500000",
      down_payment: "100000",
    });
  });

  it("builds provider-facing notes", () => {
    const note = financingNotes({
      name: "Test Tower",
      property_id: 7,
      city: "Toronto",
      price: 900000,
      source: "preconstruct",
    });
    expect(note).toContain("Test Tower");
    expect(note).toContain("#7");
    expect(note).toContain("Construct");
  });
});
