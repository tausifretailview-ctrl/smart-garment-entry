import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateSupplierPaymentViews,
  isSupplierVoucherRealtimeChange,
  prependVouchersToCache,
  refetchOnMountIfInvalidated,
} from "./supplierPaymentViews";

describe("supplierPaymentViews", () => {
  it("puts saved vouchers at the top of the cached list without duplicates", () => {
    const qc = new QueryClient();
    qc.setQueryData(["voucher-entries", "org1"], [
      { id: "old", created_at: "2026-11-01T10:00:00Z" },
      { id: "v2", created_at: "2026-11-01T09:00:00Z" },
    ]);
    prependVouchersToCache(qc, "org1", [
      { id: "v1", created_at: "2026-11-03T10:00:00Z" },
      { id: "v2", created_at: "2026-11-03T10:00:01Z" },
    ]);
    const rows = qc.getQueryData<{ id: string }[]>(["voucher-entries", "org1"]);
    expect(rows?.map((r) => r.id)).toEqual(["v2", "v1", "old"]);
  });

  it("leaves an empty cache alone (list loads normally)", () => {
    const qc = new QueryClient();
    prependVouchersToCache(qc, "org1", [{ id: "v1" }]);
    expect(qc.getQueryData(["voucher-entries", "org1"])).toBeUndefined();
  });

  it("detects supplier voucher changes from Realtime payloads", () => {
    expect(isSupplierVoucherRealtimeChange({ new: { reference_type: "supplier" } })).toBe(true);
    expect(isSupplierVoucherRealtimeChange({ old: { reference_type: "supplier" }, new: {} })).toBe(true);
    expect(isSupplierVoucherRealtimeChange({ new: { reference_type: "customer" } })).toBe(false);
    expect(isSupplierVoucherRealtimeChange(undefined)).toBe(false);
  });

  it("marks a cached Purchase dashboard so it refetches when opened", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["purchase-bills", "org1", "page1"], { bills: [], totalCount: 0 });
    const query = qc.getQueryCache().find({ queryKey: ["purchase-bills", "org1", "page1"] })!;
    expect(refetchOnMountIfInvalidated(query)).toBe(false);
    invalidateSupplierPaymentViews(qc);
    await Promise.resolve();
    expect(refetchOnMountIfInvalidated(query)).toBe(true);
  });
});
