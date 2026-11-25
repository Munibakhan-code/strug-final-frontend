import { describe, it, expect } from "vitest";
import {
  canadianMinDownPayment,
  isInsuredMortgage,
  downPaymentHint,
  validateMortgageFormClient,
} from "./mortgageValidation.js";

describe("canadianMinDownPayment", () => {
  it("tiers correctly", () => {
    expect(canadianMinDownPayment(400000)).toBe(20000);
    expect(canadianMinDownPayment(750000)).toBe(50000);
    expect(canadianMinDownPayment(1200000)).toBe(240000);
  });
});

describe("isInsuredMortgage", () => {
  it("flags under 20%", () => {
    expect(isInsuredMortgage(500000, 50000)).toBe(true);
    expect(isInsuredMortgage(500000, 100000)).toBe(false);
  });
});

describe("downPaymentHint", () => {
  it("mentions minimum and insured", () => {
    const h = downPaymentHint(750000, 50000, "Canada");
    expect(h).toContain("50,000");
    expect(h).toMatch(/insured/i);
  });
});

describe("validateMortgageFormClient", () => {
  const cat = {
    slug: "mortgage-new-purchase",
    form_schema: [
      { key: "property_price", label: "Property Price", type: "number", required: true },
      { key: "down_payment", label: "Down Payment", type: "number", required: true },
      { key: "amortization_years", label: "Amortization", type: "select", required: true },
    ],
  };

  it("rejects negative and missing amortization", () => {
    const r = validateMortgageFormClient(cat, {
      property_price: -1,
      down_payment: 20000,
    }, { country: "Canada" });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.property_price).toBeTruthy();
    expect(r.fieldErrors.amortization_years).toBeTruthy();
  });

  it("rejects HELOC over equity", () => {
    const heloc = {
      slug: "mortgage-heloc",
      form_schema: [
        { key: "property_value", label: "Property Value", type: "number", required: true },
        { key: "mortgage_balance", label: "Balance", type: "number", required: true },
        { key: "requested_credit_limit", label: "Limit", type: "number", required: true },
      ],
    };
    const r = validateMortgageFormClient(heloc, {
      property_value: 800000,
      mortgage_balance: 500000,
      requested_credit_limit: 400000,
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.requested_credit_limit).toMatch(/equity/i);
  });
});
