import { describe, expect, it } from "vitest";
import {
  salesmanSizeBoxCount,
  variantsForSalesmanSizeGrid,
} from "./salesmanOrderSizeGrid";

describe("salesman order size grid", () => {
  it("shows one box per size when the same size has several stock rows", () => {
    const rows = [
      { id: "a", product_id: "p", size: "4", color: "BK", stock_qty: 8, sale_price: 500 },
      { id: "b", product_id: "p", size: "4", color: "BK", stock_qty: 3, sale_price: 500 },
      { id: "c", product_id: "p", size: "4", color: "BK", stock_qty: 1, sale_price: 500 },
      { id: "d", product_id: "p", size: "5", color: "BK", stock_qty: 2, sale_price: 500 },
      { id: "e", product_id: "p", size: "3", color: "BK", stock_qty: 8, sale_price: 500 },
    ];

    const grid = variantsForSalesmanSizeGrid(rows);

    expect(salesmanSizeBoxCount(rows)).toBe(3);
    expect(grid).toHaveLength(3);
    expect(grid.find((cell) => cell.size === "4")).toMatchObject({
      color: "BK",
      stock_qty: 12,
      variant_ids: ["a", "b", "c"],
    });
    expect(grid.find((cell) => cell.size === "5")?.stock_qty).toBe(2);
  });

  it("keeps two colours of the same size as separate boxes", () => {
    const rows = [
      { id: "bk", product_id: "p", size: "4", color: "BK", stock_qty: 4, sale_price: 500 },
      { id: "rd", product_id: "p", size: "4", color: "RD", stock_qty: 1, sale_price: 500 },
    ];
    const grid = variantsForSalesmanSizeGrid(rows);
    expect(grid).toHaveLength(2);
    expect(grid.map((cell) => cell.color).sort()).toEqual(["BK", "RD"]);
  });

  it("keeps out-of-stock sizes so they can still be booked", () => {
    const rows = [
      { id: "s3", product_id: "p", size: "3", color: "BK", stock_qty: 0, sale_price: 500 },
      { id: "s4", product_id: "p", size: "4", color: "BK", stock_qty: 5, sale_price: 500 },
    ];
    const grid = variantsForSalesmanSizeGrid(rows);
    expect(grid).toHaveLength(2);
    expect(grid.find((cell) => cell.size === "3")?.stock_qty).toBe(0);
  });
});
