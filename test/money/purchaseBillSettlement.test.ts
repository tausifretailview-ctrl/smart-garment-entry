import { describe, expect, it } from "vitest";
import {
  getEffectivePaidAmountForPurchaseBill,
  reconcilePurchaseBillPaymentState,
} from "@/utils/purchaseBillSettlement";

describe("purchaseBillSettlement", () => {
  it("uses max(stored paid_amount, voucher settlement) capped at net", () => {
    expect(
      getEffectivePaidAmountForPurchaseBill(
        { net_amount: 79611, paid_amount: 51025 },
        79611,
      ),
    ).toBe(79611);
  });

  it("preserves CN-adjust bumps when voucher settlement is lower", () => {
    expect(
      getEffectivePaidAmountForPurchaseBill(
        { net_amount: 100000, paid_amount: 28586 },
        51025,
      ),
    ).toBe(51025);
  });

  it("reconciles bill 494-style drift (cash stored, cash+discount on voucher)", () => {
    const rec = reconcilePurchaseBillPaymentState(
      { net_amount: 79611, paid_amount: 51025, payment_status: "partial" },
      79611,
    );
    expect(rec.paid_amount).toBe(79611);
    expect(rec.payment_status).toBe("paid");
    expect(rec.changed).toBe(true);
  });

  it("does not flag already-correct rows", () => {
    const rec = reconcilePurchaseBillPaymentState(
      { net_amount: 79611, paid_amount: 79611, payment_status: "paid" },
      79611,
    );
    expect(rec.changed).toBe(false);
  });
});
