import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ ops: [] as unknown[][], result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      db.ops.push(["from", table]);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "is", "or", "not", "order", "limit"]) {
        b[m] = (...args: unknown[]) => (db.ops.push([m, ...args]), b);
      }
      b.maybeSingle = async () => db.result;
      b.then = (resolve: (v: unknown) => void) => resolve(db.result);
      return b;
    },
  },
}));

import {
  fetchSameDaySupplierBills,
  findActiveBillWithSupplierInvoice,
  findLikelyDuplicateBill,
  nextFreeSupplierInvoiceNumber,
  type SameDayBill,
} from "@/lib/data/purchaseDuplicateChecks";

describe("purchase duplicate checks (reads)", () => {
  beforeEach(() => {
    db.ops = [];
    db.result = { data: [], error: null };
  });

  it("invoice clash: active bills of this supplier, excluding the bill being edited", async () => {
    db.result = { data: [{ id: "b2", software_bill_no: "PB/2", supplier_invoice_no: "77" }], error: null };
    expect(await findActiveBillWithSupplierInvoice("org-1", "s1", "77", "b1")).toMatchObject({ id: "b2" });
    expect(db.ops).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(db.ops).toContainEqual(["eq", "supplier_id", "s1"]);
    expect(db.ops).toContainEqual(["neq", "id", "b1"]);
    expect(db.ops).toContainEqual(["or", "is_cancelled.is.null,is_cancelled.eq.false"]);
    db.result = { data: [], error: null };
    expect(await findActiveBillWithSupplierInvoice("org-1", "s1", "78")).toBeNull();
  });

  it("a failed read throws (the screen decides)", async () => {
    db.result = { data: null, error: { message: "timeout" } };
    await expect(findActiveBillWithSupplierInvoice("org-1", "s1", "77")).rejects.toMatchObject({ message: "timeout" });
    await expect(fetchSameDaySupplierBills("org-1", "s1", "2026-11-15")).rejects.toMatchObject({ message: "timeout" });
  });

  it("next free number: one read, skips every used number", async () => {
    db.result = { data: [{ supplier_invoice_no: "10" }, { supplier_invoice_no: "11" }, { supplier_invoice_no: " 12 " }], error: null };
    expect(await nextFreeSupplierInvoiceNumber("org-1", "s1", "10")).toBe("13");
    expect(db.ops.filter((o) => o[0] === "from")).toHaveLength(1);
    db.result = { data: [], error: null };
    expect(await nextFreeSupplierInvoiceNumber("org-1", "s1", "10")).toBe("10");
  });
});

describe("findLikelyDuplicateBill", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const bill = (over: Partial<SameDayBill>): SameDayBill => ({
    id: "b1",
    software_bill_no: "PB/1",
    supplier_name: "VELVET",
    supplier_invoice_no: "26",
    bill_date: "2026-11-15",
    net_amount: 1000,
    total_qty: 10,
    created_at: "2026-11-15T08:00:00Z", // 4 h ago
    ...over,
  });

  it("same qty and amount blocks, whatever the time", () => {
    const hit = findLikelyDuplicateBill([bill({})], { filledQty: 10, netAmount: 1000, supplierInvoiceNo: "" }, now);
    expect(hit?.bill.id).toBe("b1");
    expect(hit?.reason).toContain("same total qty (10) and net amount");
  });

  it("one match only blocks when saved in the last hour", () => {
    expect(findLikelyDuplicateBill([bill({})], { filledQty: 10, netAmount: 500, supplierInvoiceNo: "" }, now)).toBeNull();
    const recent = bill({ created_at: "2026-11-15T11:40:00Z" });
    expect(findLikelyDuplicateBill([recent], { filledQty: 10, netAmount: 500, supplierInvoiceNo: "" }, now)?.reason).toContain(
      "saved 20 min ago",
    );
  });

  it("different supplier invoice numbers on both bills = a real new bill", () => {
    expect(findLikelyDuplicateBill([bill({})], { filledQty: 10, netAmount: 1000, supplierInvoiceNo: "27" }, now)).toBeNull();
    expect(findLikelyDuplicateBill([bill({})], { filledQty: 10, netAmount: 1000, supplierInvoiceNo: "26" }, now)).not.toBeNull();
  });

  it("no same-day bills: nothing to block", () => {
    expect(findLikelyDuplicateBill([], { filledQty: 1, netAmount: 1, supplierInvoiceNo: "" }, now)).toBeNull();
  });
});
