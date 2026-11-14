// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  tables: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "is", "or", "order", "limit", "in"]) {
        b[op] = (...args: unknown[]) => {
          db.calls.push({ table, op, args });
          return b;
        };
      }
      const rows = () => db.tables[table];
      b.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows()) ? (rows() as unknown[])[0] ?? null : rows() ?? null, error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: rows() ?? [], error: null });
      return b;
    },
  },
}));
vi.mock("@/utils/pricingSaleDiscPercentLookup", () => ({ fetchSaleDiscPercentBySkuId: async () => new Map([["v1", 5]]) }));

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchBillLineQuantities,
  fetchLiveLabelVariants,
  fetchPurchaseBillDate,
  fetchRecentPurchaseBills,
  findPurchaseBillIdByNumber,
  loadLabelItemsFromBill,
  quantityOnBill,
} from "@/lib/barcode/loadLabelItemsFromBill";

const code = { alphabet: "ABCDEFGHIK", includeGst: false, includeDate: false, extraPercentEnabled: false, extraPercent: 0 };

/** "Load by bill" moved out of BarcodePrinting.tsx (Plan Phase 4, S4). */
describe("loadLabelItemsFromBill", () => {
  beforeEach(() => {
    db.calls = [];
    db.tables = {
      purchase_bills: [{ id: "b1", supplier_invoice_no: "INV-9", software_bill_no: "PB/1", bill_date: "2026-11-01", supplier_id: "s1" }],
      purchase_items: [{ qty: 4, sku_id: "v1", barcode: "100001", sale_price: 999, pur_price: 500, mrp: 1299, size: "M", gst_per: 5 }],
      suppliers: [{ supplier_code: "SUP7" }],
      product_variants: [
        { id: "v1", size: "M", barcode: "100001", color: null, sale_price: 999, mrp: 1299, pur_price: 500, product_id: "p1",
          products: { product_name: "COTTON SHIRT", brand: "ACME", color: "BLUE", style: null, uom: null } },
      ],
    };
  });

  it("finds the bill in this shop only, skips the recycle bin, newest first", async () => {
    await loadLabelItemsFromBill("org-1", "PB/1", code);
    const bill = db.calls.filter((c) => c.table === "purchase_bills");
    expect(bill).toContainEqual({ table: "purchase_bills", op: "eq", args: ["organization_id", "org-1"] });
    expect(bill).toContainEqual({ table: "purchase_bills", op: "is", args: ["deleted_at", null] });
    expect(bill).toContainEqual({ table: "purchase_bills", op: "order", args: ["bill_date", { ascending: false }] });
  });

  it("turns bill lines into label items with bill number, supplier code and quantity", async () => {
    const result = await loadLabelItemsFromBill("org-1", "PB/1", code);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      sku_id: "v1", product_name: "COTTON SHIRT", brand: "ACME", color: "BLUE", size: "M",
      sale_price: 999, mrp: 1299, pur_price: 500, qty: 4, barcode: "100001",
      bill_number: "PB/1", supplier_invoice_no: "INV-9", supplier_code: "SUP7", uom: "NOS", sale_disc_percent: 5,
    });
    expect(result.items[0].purchase_code).toBeTruthy();
    // The supplier comes from the bill read; purchase_bills is read once.
    expect(db.calls.filter((c) => c.table === "purchase_bills" && c.op === "select")).toHaveLength(1);
  });

  it("reports a missing bill and a bill with no lines", async () => {
    db.tables.purchase_bills = [];
    expect((await loadLabelItemsFromBill("org-1", "X", code)).status).toBe("bill_not_found");
    db.tables.purchase_bills = [{ id: "b2", supplier_invoice_no: null, software_bill_no: "PB/2", bill_date: null, supplier_id: null }];
    db.tables.purchase_items = [];
    expect((await loadLabelItemsFromBill("org-1", "PB/2", code)).status).toBe("no_items");
  });
});

describe("bill quantities for labels", () => {
  beforeEach(() => {
    db.calls = [];
    db.tables = {
      purchase_bills: [{ id: "b1" }],
      purchase_items: [
        { sku_id: "v1", barcode: "100001", qty: 4 },
        { sku_id: null, barcode: "200002", qty: 7 },
      ],
    };
  });

  it("finds the newest bill in this shop, skipping the recycle bin", async () => {
    expect(await findPurchaseBillIdByNumber("org-1", "PB/1")).toBe("b1");
    const bill = db.calls.filter((c) => c.table === "purchase_bills");
    expect(bill).toContainEqual({ table: "purchase_bills", op: "eq", args: ["organization_id", "org-1"] });
    expect(bill).toContainEqual({ table: "purchase_bills", op: "is", args: ["deleted_at", null] });
    expect(bill).toContainEqual({ table: "purchase_bills", op: "order", args: ["bill_date", { ascending: false }] });
  });

  it("matches a label by variant first, then by barcode; 0 when not on the bill", async () => {
    const q = await fetchBillLineQuantities("b1");
    expect(quantityOnBill(q, { sku_id: "v1", barcode: "zzz" })).toBe(4);
    expect(quantityOnBill(q, { sku_id: "v9", barcode: "200002" })).toBe(7);
    expect(quantityOnBill(q, { sku_id: "v9", barcode: "999" })).toBe(0);
  });

  it("Barcode Printing reads a bill's quantities once per bill number, not per product added", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    const fn = page.slice(page.indexOf("const billQuantitiesCacheRef"), page.indexOf("const handleLoadByBill"));
    expect(fn).toContain("billQuantitiesCacheRef.current.get(key)");
    expect(fn).not.toMatch(/\.from\(/);
  });
});

describe("bill and product reads for Barcode Printing", () => {
  beforeEach(() => {
    db.calls = [];
    db.tables = {
      product_variants: [
        { id: "v1", barcode: "100001", size: "M", color: null, sale_price: "999", mrp: "1299", pur_price: "500",
          products: { product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null, color: "BLUE", uom: "NOS" } },
      ],
      purchase_bills: [{ id: "b1", software_bill_no: "PB/1", supplier_name: "S", bill_date: "2026-09-12" }],
    };
  });

  it("live variant details: this shop, not deleted, numbers parsed, colour falls back to the product", async () => {
    const live = await fetchLiveLabelVariants("org-1", ["v1"]);
    expect(live.get("v1")).toMatchObject({ barcode: "100001", color: "BLUE", sale_price: 999, mrp: 1299, pur_price: 500, product_name: "COTTON SHIRT" });
    expect(db.calls).toContainEqual({ table: "product_variants", op: "eq", args: ["organization_id", "org-1"] });
    expect(db.calls).toContainEqual({ table: "product_variants", op: "is", args: ["deleted_at", null] });
    db.calls = [];
    expect((await fetchLiveLabelVariants("org-1", [])).size).toBe(0);
    expect(db.calls).toEqual([]); // no read for an empty list
  });

  it("bill date and recent bills are read inside the shop, skipping the recycle bin", async () => {
    expect(await fetchPurchaseBillDate("org-1", "b1")).toBeTruthy();
    expect(await fetchRecentPurchaseBills("org-1")).toHaveLength(1);
    const bills = db.calls.filter((c) => c.table === "purchase_bills");
    expect(bills.filter((c) => c.op === "eq" && c.args[0] === "organization_id")).toHaveLength(2);
    expect(bills.filter((c) => c.op === "is" && c.args[0] === "deleted_at")).toHaveLength(2);
    expect(bills).toContainEqual({ table: "purchase_bills", op: "limit", args: [20] });
  });

  it("Barcode Printing has no direct database queries; live details and bill date are read together", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    expect(page).not.toMatch(/\.from\(\s*["'][a-z_]+["']\s*\)/);
    expect(page).not.toContain("@/integrations/supabase/client");
    expect(page).toMatch(/Promise\.all\(\[\s*orgIdForHydrate && skuIds\.length > 0\s*\?\s*fetchLiveLabelVariants/);
  });
});
