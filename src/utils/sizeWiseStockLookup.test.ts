import { describe, expect, it } from "vitest";
import {
  aggregateSizeWiseStock,
  sizeStockListForGroup,
  sizeWiseStockGroupKey,
} from "./sizeWiseStockLookup";

describe("sizeWiseStockGroupKey", () => {
  it("matches Stock Report size-wise grouping (name + brand + colour + style)", () => {
    expect(sizeWiseStockGroupKey("FL487", "RLX", "T PL", "FL")).toBe(
      sizeWiseStockGroupKey("fl487", "rlx", " t pl ", "fl"),
    );
    expect(sizeWiseStockGroupKey("FL487", "RLX", "NAVY", "FL")).not.toBe(
      sizeWiseStockGroupKey("FL487", "RLX", "T PL", "FL"),
    );
  });
});

describe("aggregateSizeWiseStock", () => {
  it("sums barcodes for the same name/brand/colour/style and ignores other brands", () => {
    const byGroup = aggregateSizeWiseStock([
      { product_name: "FL487", brand: "RLX", color: "NAVY", style: "FL", size: "7", stock_qty: 3 },
      { product_name: "FL487", brand: "RLX", color: "NAVY", style: "FL", size: "07", stock_qty: 2 },
      { product_name: "FL487", brand: "OTHER", color: "NAVY", style: "FL", size: "7", stock_qty: 40 },
    ]);
    const navyRlx = sizeStockListForGroup(byGroup, "FL487", "RLX", "NAVY", "FL");
    expect(navyRlx).toEqual([{ size: "7", qty: 5 }]);
    const other = sizeStockListForGroup(byGroup, "FL487", "OTHER", "NAVY", "FL");
    expect(other).toEqual([{ size: "7", qty: 40 }]);
  });
});
