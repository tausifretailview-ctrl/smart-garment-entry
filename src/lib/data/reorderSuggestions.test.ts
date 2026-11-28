import { describe, expect, it } from "vitest";
import { fetchReorderSuggestions, groupBySupplier, packNote, type ReorderDb, type ReorderSuggestion } from "./reorderSuggestions";

/** Reorder by min / max (supermarket phase 2, Nov 2026). */
const s = (p: Partial<ReorderSuggestion>): ReorderSuggestion => ({
  variant_id: "v", product_id: "p", product_name: "X", brand: null, category: null, size: "None", color: null, barcode: null,
  uom: "PCS", pack_unit: null, pack_factor: null, reorder_level: 10, max_stock: null, product_stock: 5, variant_stock: 5,
  sold_in_period: 0, suggested_qty: 15, pur_price: 10, gst_percent: 5, hsn_code: null, supplier_id: null, supplier_name: null, ...p,
});

describe("reorder list", () => {
  it("one group per last supplier; never-bought items last", () => {
    const groups = groupBySupplier([
      s({ variant_id: "a", supplier_id: "s2", supplier_name: "Metro" }),
      s({ variant_id: "b" }),
      s({ variant_id: "c", supplier_id: "s1", supplier_name: "Arihant" }),
      s({ variant_id: "d", supplier_id: "s2", supplier_name: "Metro" }),
    ]);
    expect(groups.map((g) => [g.supplierName, g.rows.map((r) => r.variant_id)])).toEqual([
      ["Arihant", ["c"]],
      ["Metro", ["a", "d"]],
      ["No supplier yet", ["b"]],
    ]);
  });

  it("shows the order in cases", () => {
    expect(packNote(216, "CASE", 24)).toBe("9 CASE");
    expect(packNote(130, "CASE", 24)).toBe("5.42 CASE");
    expect(packNote(10, null, null)).toBe("");
  });

  it("reads numbers; before the SQL is run it says so", async () => {
    const ok: ReorderDb = { rpc: () => Promise.resolve({ data: [{ ...s({}), suggested_qty: "216.0000", pack_factor: "24" }], error: null }) };
    const [r] = (await fetchReorderSuggestions(ok, "o", 60))!;
    expect(r.suggested_qty).toBe(216);
    expect(r.pack_factor).toBe(24);
    const missing: ReorderDb = { rpc: () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "x" } }) };
    await expect(fetchReorderSuggestions(missing, "o", 60)).resolves.toBeNull();
  });
});
