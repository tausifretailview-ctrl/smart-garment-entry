import { describe, expect, it } from "vitest";
import {
  assertMixPaymentHasBreakdown,
  MIX_PAYMENT_BREAKDOWN_REQUIRED_MESSAGE,
} from "./mixPaymentSaveGuard";

describe("assertMixPaymentHasBreakdown", () => {
  it("allows single-method saves without breakdown", () => {
    expect(() => assertMixPaymentHasBreakdown("cash", undefined)).not.toThrow();
    expect(() => assertMixPaymentHasBreakdown("pay_later", undefined)).not.toThrow();
  });

  it("allows mix when breakdown is present", () => {
    expect(() =>
      assertMixPaymentHasBreakdown("multiple", {
        cashAmount: 100,
        cardAmount: 0,
        upiAmount: 0,
        totalPaid: 100,
        refundAmount: 0,
      }),
    ).not.toThrow();
  });

  it("blocks mix without breakdown", () => {
    expect(() => assertMixPaymentHasBreakdown("multiple", undefined)).toThrow(
      MIX_PAYMENT_BREAKDOWN_REQUIRED_MESSAGE,
    );
    expect(() => assertMixPaymentHasBreakdown("multiple", null)).toThrow(
      MIX_PAYMENT_BREAKDOWN_REQUIRED_MESSAGE,
    );
  });
});
