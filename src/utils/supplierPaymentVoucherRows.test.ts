import { describe, expect, it } from "vitest";
import {
  buildSupplierPaymentVoucherRows,
  supplierPaymentVoucherDescription,
  type SupplierPaymentBill,
} from "./supplierPaymentVoucherRows";

const SUPPLIER = "supplier-1";
const bill = (id: string, ref: string): SupplierPaymentBill => ({
  id,
  software_bill_no: ref,
  supplier_invoice_no: ref,
});

describe("buildSupplierPaymentVoucherRows", () => {
  it("links a single-bill payment to the bill, not the supplier", () => {
    const rows = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 5000,
      allocations: [{ bill: bill("bill-1", "B1"), amountApplied: 5000 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].referenceId).toBe("bill-1");
    expect(rows[0].kind).toBe("bill");
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].voucherNumberSuffix).toBe("");
  });

  it("splits a multi-bill payment into one row per bill", () => {
    const rows = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 8000,
      allocations: [
        { bill: bill("bill-1", "B1"), amountApplied: 5000 },
        { bill: bill("bill-2", "B2"), amountApplied: 3000 },
      ],
    });
    expect(rows.map((r) => [r.referenceId, r.amount])).toEqual([
      ["bill-1", 5000],
      ["bill-2", 3000],
    ]);
    expect(rows.map((r) => r.voucherNumberSuffix)).toEqual(["-1", "-2"]);
  });

  it("keeps an unapplied remainder on the supplier as on-account", () => {
    const rows = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 9000,
      allocations: [{ bill: bill("bill-1", "B1"), amountApplied: 5000 }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ referenceId: "bill-1", amount: 5000, kind: "bill" });
    expect(rows[1]).toMatchObject({ referenceId: SUPPLIER, amount: 4000, kind: "on_account" });
  });

  it("keeps an opening-balance payment (no bills) on the supplier", () => {
    const rows = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 4000,
      allocations: [],
    });
    expect(rows).toEqual([
      {
        referenceId: SUPPLIER,
        amount: 4000,
        voucherNumberSuffix: "",
        kind: "on_account",
        billRef: null,
      },
    ]);
  });

  it("never emits more than the payment amount", () => {
    for (const paymentAmount of [1000, 5000, 12345.67]) {
      const rows = buildSupplierPaymentVoucherRows({
        supplierId: SUPPLIER,
        paymentAmount,
        allocations: [
          { bill: bill("bill-1", "B1"), amountApplied: Math.min(paymentAmount, 4000) },
          { bill: bill("bill-2", "B2"), amountApplied: 0 },
        ],
      });
      const total = rows.reduce((s, r) => s + r.amount, 0);
      expect(total).toBeCloseTo(paymentAmount, 2);
    }
  });

  it("drops zero allocations rather than emitting empty vouchers", () => {
    const rows = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 5000,
      allocations: [
        { bill: bill("bill-1", "B1"), amountApplied: 5000 },
        { bill: bill("bill-2", "B2"), amountApplied: 0 },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].referenceId).toBe("bill-1");
  });
});

describe("supplierPaymentVoucherDescription", () => {
  it("keeps the user's note but no longer lets it decide the link", () => {
    const [row] = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 5000,
      allocations: [{ bill: bill("bill-1", "B1"), amountApplied: 5000 }],
    });
    const desc = supplierPaymentVoucherDescription({
      row,
      userDescription: "June payment",
      supplierName: "SANGAMN FASHION",
      paymentDetails: "",
    });
    expect(desc).toContain("June payment");
    // The row is still structurally bound to the bill regardless of the prose.
    expect(row.referenceId).toBe("bill-1");
  });

  it("labels an on-account row without pretending it is a bill payment", () => {
    const [row] = buildSupplierPaymentVoucherRows({
      supplierId: SUPPLIER,
      paymentAmount: 4000,
      allocations: [],
    });
    const desc = supplierPaymentVoucherDescription({
      row,
      userDescription: "",
      supplierName: "SANGAMN FASHION",
      paymentDetails: "",
    });
    expect(desc).toBe("On-account payment to SANGAMN FASHION");
    expect(desc).not.toMatch(/Payment for Bill/i);
  });
});
