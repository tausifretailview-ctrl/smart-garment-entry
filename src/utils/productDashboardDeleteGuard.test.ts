import { describe, expect, it } from "vitest";
import {
  collectProductsWithBlockingStock,
  productHasBlockingStock,
} from "./productDashboardDeleteGuard";

const isService = (t: string) => t === "service";

describe("productDashboardDeleteGuard", () => {
  it("blocks non-service products with stock", () => {
    expect(productHasBlockingStock("goods", 6, isService)).toBe(true);
    expect(productHasBlockingStock("goods", 0, isService)).toBe(false);
    expect(productHasBlockingStock("service", 99, isService)).toBe(false);
  });

  it("collects only selected rows with stock", () => {
    const rows = [
      { product_id: "a", product_name: "A", product_type: "goods", total_stock: 6 },
      { product_id: "b", product_name: "B", product_type: "goods", total_stock: 0 },
      { product_id: "c", product_name: "C", product_type: "service", total_stock: 1 },
    ];
    expect(collectProductsWithBlockingStock(rows, ["a", "b", "c"], isService).map((r) => r.product_id)).toEqual([
      "a",
    ]);
  });
});
