import { describe, expect, it } from "vitest";
import {
  evaluateEnquiryRateLimit,
  ENQUIRY_RATE_LIMIT_MAX,
  ENQUIRY_RATE_LIMIT_WINDOW_MS,
  validateEnquiryInput,
} from "./storefrontEnquiry";

describe("validateEnquiryInput", () => {
  it("accepts a typical Indian mobile enquiry", () => {
    const result = validateEnquiryInput({
      customerName: "  Asha  ",
      customerPhone: "+91 98765 43210",
      message: "Do you have size M?",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.customerName).toBe("Asha");
      expect(result.value.customerPhone).toBe("919876543210");
      expect(result.value.message).toBe("Do you have size M?");
    }
  });

  it("rejects short names and short phones", () => {
    expect(validateEnquiryInput({ customerName: "A", customerPhone: "9876543210" }).ok).toBe(
      false,
    );
    expect(validateEnquiryInput({ customerName: "Asha", customerPhone: "12345" }).ok).toBe(false);
  });

  it("rejects overlong messages and bad product ids", () => {
    expect(
      validateEnquiryInput({
        customerName: "Asha",
        customerPhone: "9876543210",
        message: "x".repeat(1001),
      }).ok,
    ).toBe(false);
    expect(
      validateEnquiryInput({
        customerName: "Asha",
        customerPhone: "9876543210",
        productId: "not-a-uuid",
      }).ok,
    ).toBe(false);
  });
});

describe("evaluateEnquiryRateLimit", () => {
  const now = 1_700_000_000_000;

  it("allows the first hit and up to the hourly max", () => {
    let state = evaluateEnquiryRateLimit(null, now);
    expect(state.allowed).toBe(true);
    for (let i = 1; i < ENQUIRY_RATE_LIMIT_MAX; i += 1) {
      state = evaluateEnquiryRateLimit(state.next, now + i * 1000);
      expect(state.allowed).toBe(true);
    }
    const blocked = evaluateEnquiryRateLimit(state.next, now + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.next.hitCount).toBe(ENQUIRY_RATE_LIMIT_MAX);
  });

  it("resets after the window", () => {
    const prev = { windowStartedAt: now, hitCount: ENQUIRY_RATE_LIMIT_MAX };
    const next = evaluateEnquiryRateLimit(prev, now + ENQUIRY_RATE_LIMIT_WINDOW_MS);
    expect(next.allowed).toBe(true);
    expect(next.next.hitCount).toBe(1);
  });
});
