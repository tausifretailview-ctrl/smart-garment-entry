import { describe, expect, it } from "vitest";
import {
  allocateSupplierCreditToBills,
  getSupplierBillRawOutstanding,
  isSupplierBillOpenOnDashboard,
} from "@/utils/supplierBillOutstanding";

describe("isSupplierBillOpenOnDashboard", () => {
  it("keeps a not-paid bill listed even when FIFO credit would cover it", () => {
    const bill = { id: "2808", net_amount: 37173, paid_amount: 0, bill_date: "2026-05-06" };
    const newer = { id: "3481", net_amount: 42500, paid_amount: 0, bill_date: "2026-05-27" };
    const map = allocateSupplierCreditToBills([bill, newer], 37173);

    expect(isSupplierBillOpenOnDashboard(bill)).toBe(true);
    expect(getSupplierBillRawOutstanding(bill)).toBe(37173);
    expect(map.get("2808")?.netPayable).toBe(0);
    expect(map.get("3481")?.netPayable).toBe(42500);
  });

  it("hides a fully paid bill", () => {
    const bill = { id: "paid", net_amount: 11554, paid_amount: 11554, bill_date: "2026-03-27" };
    expect(isSupplierBillOpenOnDashboard(bill)).toBe(false);
  });
});
