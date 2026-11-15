import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ops: [] as unknown[][],
  result: { data: null as unknown, error: null as unknown },
  rpc: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (...args: unknown[]) => (db.ops.push(["rpc", ...args]), db.rpc),
    from: (table: string) => {
      db.ops.push(["from", table]);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "or", "not", "order", "limit"]) {
        b[m] = (...args: unknown[]) => (db.ops.push([m, ...args]), b);
      }
      b.maybeSingle = async () => db.result;
      b.single = async () => db.result;
      b.then = (resolve: (v: unknown) => void) => resolve(db.result);
      return b;
    },
  },
}));

import {
  fetchAutoSupplierInvoiceNumbers,
  fetchLastPurchaseBill,
  fetchPurchaseBillForEdit,
  fetchPurchaseBillIds,
  peekNextSupplierInvoiceNumber,
} from "@/lib/data/purchaseBillReads";

/** Plan Phase 4, S4 + D6: Purchase Entry's bill reads, shop-scoped and live bills only. */
describe("purchase bill reads", () => {
  beforeEach(() => {
    db.ops = [];
    db.result = { data: null, error: null };
    db.rpc = { data: null, error: null };
  });

  const scoped = () => {
    expect(db.ops).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(db.ops).toContainEqual(["is", "deleted_at", null]);
  };

  it("last bill: newest live bill of the shop, null when there is none", async () => {
    db.result = { data: { software_bill_no: "PB/9" }, error: null };
    expect(await fetchLastPurchaseBill("org-1")).toEqual({ software_bill_no: "PB/9" });
    scoped();
    expect(db.ops).toContainEqual(["order", "created_at", { ascending: false }]);
    db.result = { data: null, error: null };
    expect(await fetchLastPurchaseBill("org-1")).toBeNull();
  });

  it("a failed read throws", async () => {
    db.result = { data: null, error: { message: "denied" } };
    await expect(fetchLastPurchaseBill("org-1")).rejects.toMatchObject({ message: "denied" });
    await expect(fetchPurchaseBillIds("org-1")).rejects.toMatchObject({ message: "denied" });
  });

  it("peek: server serial as text; null while the SQL is not deployed", async () => {
    db.rpc = { data: 42, error: null };
    expect(await peekNextSupplierInvoiceNumber("org-1")).toBe("42");
    expect(db.ops[0]).toEqual(["rpc", "peek_next_supplier_invoice_number", { p_organization_id: "org-1" }]);
    db.rpc = { data: null, error: { code: "PGRST202", message: "not found" } };
    expect(await peekNextSupplierInvoiceNumber("org-1")).toBeNull();
    db.rpc = { data: null, error: { code: "42501", message: "denied" } };
    await expect(peekNextSupplierInvoiceNumber("org-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("auto invoice numbers: live, not cancelled, auto-generated only", async () => {
    db.result = { data: [{ supplier_invoice_no: "7" }], error: null };
    expect(await fetchAutoSupplierInvoiceNumbers("org-1")).toEqual([{ supplier_invoice_no: "7" }]);
    scoped();
    expect(db.ops).toContainEqual(["eq", "supplier_inv_auto_generated", true]);
    expect(db.ops).toContainEqual(["or", "is_cancelled.is.null,is_cancelled.eq.false"]);
  });

  it("navigation list: newest 500 live bills", async () => {
    db.result = { data: [{ id: "b1", software_bill_no: "PB/1" }], error: null };
    expect(await fetchPurchaseBillIds("org-1")).toEqual([{ id: "b1", software_bill_no: "PB/1" }]);
    scoped();
    expect(db.ops).toContainEqual(["limit", 500]);
  });

  it("bill for edit: by id inside the shop", async () => {
    db.result = { data: { id: "b1" }, error: null };
    expect(await fetchPurchaseBillForEdit("org-1", "b1")).toEqual({ id: "b1" });
    expect(db.ops).toContainEqual(["eq", "id", "b1"]);
    scoped();
  });
});
