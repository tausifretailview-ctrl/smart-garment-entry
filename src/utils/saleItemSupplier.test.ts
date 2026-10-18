import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildSupplierWiseSales, NO_SUPPLIER_LABEL, type SupplierLookup } from "./saleItemSupplier";

const lookup: SupplierLookup = {
  byVariant: new Map([
    ["v1", { supplier_id: "s1", supplier_name: "RAJ TEXTILES" }],
    ["v2", { supplier_id: "s1", supplier_name: "RAJ TEXTILES" }],
    ["v3", { supplier_id: "s2", supplier_name: "BATA DEPOT" }],
  ]),
  byProduct: new Map([["p4", { supplier_id: "s2", supplier_name: "BATA DEPOT" }]]),
};

const lines = [
  { variant_id: "v1", product_id: "p1", product_name: "SHIRT", size: "M", quantity: 2, line_total: 1000, products: { brand: "LEE" } },
  { variant_id: "v2", product_id: "p1", product_name: "SHIRT", size: "L", quantity: 3, line_total: 1500, products: { brand: "LEE" } },
  { variant_id: "v3", product_id: "p3", product_name: "SHOES", size: "8", quantity: 1, line_total: 2000 },
  { variant_id: "v9", product_id: "p4", product_name: "SANDAL", size: "7", quantity: 1, line_total: 500 },
  { variant_id: "v8", product_id: "p8", product_name: "OIL", size: "", quantity: 4, line_total: 400 },
];

describe("buildSupplierWiseSales", () => {
  it("ranks suppliers and their products by qty sold, with product fallback and no-purchase bucket", () => {
    const rows = buildSupplierWiseSales(lines, lookup, "product");
    expect(rows.map((r) => [r.supplier_name, r.total_qty, r.total_amount])).toEqual([
      ["RAJ TEXTILES", 5, 2500],
      [NO_SUPPLIER_LABEL, 4, 400],
      ["BATA DEPOT", 2, 2500],
    ]);
    expect(rows[0].products).toEqual([
      expect.objectContaining({ product_name: "SHIRT", qty: 5, size: "M, L", brand: "LEE" }),
    ]);
    expect(rows[2].products.map((p) => p.product_name)).toEqual(["SHOES", "SANDAL"]);
  });

  it("splits sizes in variant level", () => {
    const rows = buildSupplierWiseSales(lines, lookup, "variant");
    expect(rows[0].products.map((p) => [p.size, p.qty])).toEqual([["L", 3], ["M", 2]]);
  });
});
