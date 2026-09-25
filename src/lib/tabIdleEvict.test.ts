import { describe, expect, it } from "vitest";
import { isIdleEvictableDashboardPath, READ_ONLY_IDLE_UNMOUNT_MS } from "@/lib/tabIdleEvict";
import { resolveNextSupplierInvoiceNumber } from "@/utils/purchaseSupplierInvoiceNumber";

describe("read-only tab idle eviction", () => {
  it("unmounts reports and settings after 4 minutes and keeps live bills", () => {
    expect(READ_ONLY_IDLE_UNMOUNT_MS).toBe(4 * 60 * 1000);
    expect(isIdleEvictableDashboardPath("stock-report")).toBe(true);
    expect(isIdleEvictableDashboardPath("settings")).toBe(true);
    expect(isIdleEvictableDashboardPath("sales-report")).toBe(true);
    expect(isIdleEvictableDashboardPath("purchase-entry")).toBe(false);
    expect(isIdleEvictableDashboardPath("pos-sales")).toBe(false);
    expect(isIdleEvictableDashboardPath("sales-invoice")).toBe(false);
  });
});

describe("supplier invoice peek stays the number source", () => {
  it("uses the server peek and does not invent the next serial from the scan", () => {
    expect(resolveNextSupplierInvoiceNumber("42", ["99", "100"])).toBe("42");
    expect(resolveNextSupplierInvoiceNumber(null, ["7", "8"])).toBe("9");
  });
});
