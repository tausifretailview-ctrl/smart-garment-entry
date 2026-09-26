import { describe, expect, it } from "vitest";
import {
  buildPurchaseBillSizeGrid,
  mapPurchaseItemsToPrintLines,
} from "./purchaseBillPrintLayouts";

describe("purchaseBillPrintLayouts", () => {
  it("pivots footwear sizes into one row per product and color", () => {
    const lines = mapPurchaseItemsToPrintLines([
      {
        id: "1",
        product_name: "SHOES",
        brand: "BATA",
        color: "WHITE",
        size: "4",
        qty: 10,
        pur_price: 700,
        gst_per: 5,
        line_total: 7000,
      },
      {
        id: "2",
        product_name: "SHOES",
        brand: "BATA",
        color: "WHITE",
        size: "5",
        qty: 10,
        pur_price: 700,
        gst_per: 5,
        line_total: 7000,
      },
    ]);
    const grid = buildPurchaseBillSizeGrid(lines);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].qtyBySize["4"]).toBe(10);
    expect(grid.rows[0].qtyBySize["5"]).toBe(10);
    expect(grid.rows[0].totalPairs).toBe(20);
  });

  it("keeps barcode layout as one line per purchase item", () => {
    const lines = mapPurchaseItemsToPrintLines([
      { id: "a", product_name: "A", barcode: "111", size: "7", qty: 1, pur_price: 100, line_total: 100 },
      { id: "b", product_name: "B", barcode: "222", size: "8", qty: 2, pur_price: 100, line_total: 200 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].barcode).toBe("111");
  });
});
