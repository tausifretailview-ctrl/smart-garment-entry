import { describe, expect, it } from "vitest";
import {
  purchaseBillPaidAfterVoucherRemoved,
  splitPaymentSiblings,
  supplierPaymentGroupNumber,
} from "./supplierPaymentDelete";

describe("purchaseBillPaidAfterVoucherRemoved", () => {
  it("puts a fully paid bill back to unpaid when its only payment is deleted", () => {
    expect(purchaseBillPaidAfterVoucherRemoved({ paid_amount: 1680, net_amount: 1680 }, 1680)).toEqual({
      paid_amount: 0,
      payment_status: "unpaid",
    });
  });

  it("keeps the other payment when one of two is deleted", () => {
    expect(purchaseBillPaidAfterVoucherRemoved({ paid_amount: 5000, net_amount: 8000 }, 3000)).toEqual({
      paid_amount: 2000,
      payment_status: "partial",
    });
  });

  it("never goes below zero", () => {
    expect(purchaseBillPaidAfterVoucherRemoved({ paid_amount: 100, net_amount: 500 }, 300).paid_amount).toBe(0);
  });

  it("stays paid when the rest still covers the bill", () => {
    expect(purchaseBillPaidAfterVoucherRemoved({ paid_amount: 1200, net_amount: 1000 }, 200).payment_status).toBe(
      "paid",
    );
  });
});

describe("split payment grouping", () => {
  it("reads the base voucher number", () => {
    expect(supplierPaymentGroupNumber("PAY/26-27/872-2")).toBe("PAY/26-27/872");
    expect(supplierPaymentGroupNumber("PAY/26-27/871")).toBe("PAY/26-27/871");
  });

  it("lists the other parts of a split payment only", () => {
    const all = [
      { id: "a", voucher_number: "PAY/26-27/872-1" },
      { id: "b", voucher_number: "PAY/26-27/872-2" },
      { id: "c", voucher_number: "PAY/26-27/871" },
      { id: "d", voucher_number: "PAY/26-27/8721" },
    ];
    expect(splitPaymentSiblings(all[0], all).map((v) => v.id)).toEqual(["b"]);
    expect(splitPaymentSiblings(all[2], all)).toEqual([]);
  });
});
