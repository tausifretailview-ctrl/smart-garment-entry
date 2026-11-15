import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; ids: string[]; ranges: Array<[number, number]> };
const calls: Call[] = [];
let tables: Record<string, Array<Record<string, unknown>>> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const call: Call = { table, ids: [], ranges: [] };
      calls.push(call);
      let idCol = "id";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order"]) q[m] = () => q;
      q.in = (col: string, ids: string[]) => {
        idCol = col;
        call.ids = ids;
        return q;
      };
      q.range = (a: number, b: number) => {
        call.ranges.push([a, b]);
        const rows = (tables[table] ?? []).filter((r) => call.ids.includes(String(r[idCol])));
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
      };
      return q;
    },
  },
}));

import { fetchCatalogRowsForProductIds } from "./productDashboardBarcodeSearch";

describe("fetchCatalogRowsForProductIds (barcode / text search supplement)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("counts every size past the 1,000-row reply cap and batches 200 ids per request", async () => {
    const productIds = Array.from({ length: 250 }, (_, i) => `p${i}`);
    tables = {
      products: productIds.map((id) => ({ id, product_name: id, product_type: "goods", status: "active" })),
      // p0 has 1,200 sizes of 1 each; everyone else one size of 2.
      product_variants: [
        ...Array.from({ length: 1200 }, () => ({ product_id: "p0", stock_qty: 1, is_dc_product: false })),
        ...productIds.slice(1).map((id) => ({ product_id: id, stock_qty: 2, is_dc_product: false })),
      ],
    };

    const rows = await fetchCatalogRowsForProductIds("org-1", productIds);

    expect(rows).toHaveLength(250);
    const p0 = rows.find((r) => r.product_id === "p0");
    expect(p0?.total_stock).toBe(1200);
    expect(p0?.variant_count).toBe(1200);
    expect(rows.find((r) => r.product_id === "p249")?.total_stock).toBe(2);
    for (const call of calls) expect(call.ids.length).toBeLessThanOrEqual(200);
    const variantPages = calls.filter((c) => c.table === "product_variants").flatMap((c) => c.ranges);
    expect(variantPages).toContainEqual([1000, 1999]);
  });
});
