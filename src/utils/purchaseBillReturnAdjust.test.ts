import { describe, expect, it } from "vitest";
import {
  buildAppliedReturnAdjustByBillIdMap,
  buildPurchaseReturnAdjustByBillId,
  purchaseReturnAppliedToBillAmount,
} from "@/utils/purchaseBillReturnAdjust";

describe("purchaseBillReturnAdjust", () => {
  it("full apply when credit_available_balance is null", () => {
    const applied = purchaseReturnAppliedToBillAmount({
      linked_bill_id: "bill-1",
      net_amount: 5000,
      credit_available_balance: null,
      credit_status: "adjusted",
      return_date: "2026-07-01",
    });
    expect(applied).toBe(5000);
  });

  it("partial apply uses net minus remainder", () => {
    const applied = purchaseReturnAppliedToBillAmount({
      linked_bill_id: "bill-1",
      net_amount: 5000,
      credit_available_balance: 1500,
      credit_status: "adjusted",
      return_date: "2026-07-02",
    });
    expect(applied).toBe(3500);
  });

  it("aggregates by bill id with earliest adjust date", () => {
    const map = buildPurchaseReturnAdjustByBillId([
      {
        linked_bill_id: "bill-1",
        net_amount: 2000,
        credit_available_balance: 0,
        credit_status: "adjusted",
        return_date: "2026-07-05",
      },
      {
        linked_bill_id: "bill-1",
        net_amount: 1000,
        credit_available_balance: null,
        credit_status: "adjusted",
        return_date: "2026-07-03",
      },
    ]);
    expect(map["bill-1"].purchase_return_adjust).toBe(3000);
    expect(map["bill-1"].pr_adjust_date).toBe("2026-07-03");
  });

  it("applied map covers returns with or without a CN voucher, skips outstanding/pending", () => {
    const map = buildAppliedReturnAdjustByBillIdMap([
      { linked_bill_id: "bill-1", net_amount: 118, credit_available_balance: 0, credit_status: "adjusted" },
      { linked_bill_id: "bill-1", net_amount: 50, credit_available_balance: 20, credit_status: "adjusted" },
      { linked_bill_id: null, net_amount: 70, credit_available_balance: null, credit_status: "adjusted_outstanding" },
      { linked_bill_id: "bill-2", net_amount: 90, credit_available_balance: null, credit_status: "pending" },
    ]);
    expect(map.get("bill-1")).toBe(148);
    expect(map.has("bill-2")).toBe(false);
  });
});
