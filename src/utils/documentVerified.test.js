/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { isDocumentVerified } from "./documentVerified.js";

describe("isDocumentVerified", () => {
  it("is true when document_verified is true", () => {
    expect(isDocumentVerified({ document_verified: true })).toBe(true);
  });

  it("is true when document_verification_status is verified", () => {
    expect(isDocumentVerified({ document_verification_status: "verified" })).toBe(true);
  });

  it("is false for missing, pending, or empty user", () => {
    expect(isDocumentVerified(null)).toBe(false);
    expect(isDocumentVerified(undefined)).toBe(false);
    expect(isDocumentVerified({})).toBe(false);
    expect(isDocumentVerified({ document_verified: false })).toBe(false);
    expect(isDocumentVerified({ document_verification_status: "pending" })).toBe(false);
  });

  it("does not treat truthy strings as verified except status verified", () => {
    expect(isDocumentVerified({ document_verified: "yes" })).toBe(false);
    expect(isDocumentVerified({ document_verification_status: "Verified" })).toBe(false);
  });
});
