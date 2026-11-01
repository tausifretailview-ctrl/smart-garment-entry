import { describe, expect, it } from "vitest";
import { filterReorderItems, summarizeReorderLevels, type ReorderProductRow } from "./reorderLevelReport";

function product(overrides: Partial<ReorderProductRow>): ReorderProductRow {
  return {
    id: "p1",
    product_name: "MS Bolt 10mm",
    brand: "Unbrako",
    category: "Fasteners",
    uom: "NOS",
    alt_uom: "BOX",
    alt_uom_factor: 100,
    reorder_level: 500,
    product_variants: [{ stock_qty: 120, deleted_at: null }],
    ...overrides,
  };
}

describe("summarizeReorderLevels", () => {
  it("keeps items below or at their level, emptiest first", () => {
    const { tracked, items } = summarizeReorderLevels([
      product({}),
      product({ id: "p2", product_name: "Washer", reorder_level: 100, product_variants: [{ stock_qty: 100, deleted_at: null }] }),
      product({ id: "p3", product_name: "Nut", reorder_level: 200, product_variants: [{ stock_qty: 10, deleted_at: null }] }),
      product({ id: "p4", product_name: "Gasket", reorder_level: 10, product_variants: [{ stock_qty: 50, deleted_at: null }] }),
      product({ id: "p5", product_name: "No level", reorder_level: null }),
    ]);
    expect(tracked).toBe(4);
    expect(items.map((i) => [i.productName, i.state, i.shortQty])).toEqual([
      ["Nut", "below", 190],
      ["MS Bolt 10mm", "below", 380],
      ["Washer", "at", 0],
    ]);
  });

  it("adds stock across live variants only", () => {
    const { items } = summarizeReorderLevels([
      product({
        product_variants: [
          { stock_qty: 100, deleted_at: null },
          { stock_qty: 300, deleted_at: null },
          { stock_qty: 900, deleted_at: "2026-10-01" },
        ],
      }),
    ]);
    expect(items[0]).toMatchObject({ stockQty: 400, shortQty: 100 });
  });

  it("filters by name, brand or category", () => {
    const { items } = summarizeReorderLevels([product({}), product({ id: "p2", product_name: "Nut", brand: "Tata" })]);
    expect(filterReorderItems(items, "tata").map((i) => i.productName)).toEqual(["Nut"]);
    expect(filterReorderItems(items, "fasten")).toHaveLength(2);
  });
});
