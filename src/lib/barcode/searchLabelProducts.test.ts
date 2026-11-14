// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ ors: [] as { table: string; filter: string }[], tables: {} as Record<string, unknown[]> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "is", "gt", "in", "order", "limit"]) b[op] = () => b;
      b.or = (filter: string) => {
        db.ors.push({ table, filter });
        return b;
      };
      b.then = (resolve: (v: unknown) => void) => resolve({ data: db.tables[table] ?? [], error: null });
      return b;
    },
  },
}));
vi.mock("@/utils/pricingSaleDiscPercentLookup", () => ({
  fetchSaleDiscPercentBySkuId: async () => new Map([["v1", 10]]),
}));

import { searchLabelProducts } from "@/lib/barcode/searchLabelProducts";

/** The product search moved out of BarcodePrinting.tsx (Plan Phase 4, S4) searches the same way. */
describe("searchLabelProducts", () => {
  beforeEach(() => {
    db.ors = [];
    db.tables = {
      products: [{ id: "p1" }],
      product_variants: [
        { id: "v1", size: "M", sale_price: 999, mrp: 1299, barcode: "100001", stock_qty: 3, color: null, pur_price: 500, product_id: "p1",
          products: { product_name: "COTTON SHIRT", brand: "ACME", color: "BLUE", style: null, category: "SHIRTS", uom: null } },
      ],
      purchase_items: [{ sku_id: "v1", bill_id: "b1" }],
      purchase_bills: [{ id: "b1", supplier_id: "s1" }],
      suppliers: [{ id: "s1", supplier_code: "SUP7" }],
    };
  });

  it("maps a variant with its product, latest supplier code and sale discount", async () => {
    const [row] = await searchLabelProducts("org-1", "shirt");
    expect(row).toMatchObject({
      id: "v1", product_name: "COTTON SHIRT", brand: "ACME", color: "BLUE", size: "M",
      sale_price: 999, mrp: 1299, barcode: "100001", stock_qty: 3, pur_price: 500,
      supplier_code: "SUP7", uom: "NOS", sale_disc_percent: 10,
    });
  });

  it("a barcode is matched exactly / by prefix; text is matched anywhere", async () => {
    await searchLabelProducts("org-1", "100001");
    const barcode = db.ors.find((o) => o.table === "product_variants")!.filter;
    expect(barcode).toContain("barcode.eq.100001");
    expect(barcode).toContain("barcode.ilike.100001%");
    expect(barcode).not.toContain("size.ilike");

    db.ors = [];
    await searchLabelProducts("org-1", "blue");
    const text = db.ors.find((o) => o.table === "product_variants")!.filter;
    expect(text).toContain("barcode.ilike.%blue%");
    expect(text).toContain("size.ilike.%blue%");
    expect(text).toContain("product_id.in.(p1)");
  });

  it("Barcode Printing ignores results of a search the user has typed past", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    const effect = page.slice(page.indexOf("// Search for products as user types"), page.indexOf("// Auto-fill quantities when switching"));
    expect(effect).toContain("searchLabelProducts(currentOrganization.id, searchQuery)");
    expect(effect.match(/if \(superseded\) return;/g)).toHaveLength(3);
    expect(effect).toContain("superseded = true;");
  });
});
