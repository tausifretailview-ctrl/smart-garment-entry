import { describe, expect, it } from "vitest";
import {
  defaultLineSalesmanFromHeader,
  effectiveCartLineSalesman,
  saleItemSalesmanFromCartLine,
  withDefaultLineSalesman,
} from "./posLineSalesman";
import type { PosCartItem } from "@/lib/posBilling/types";

const baseItem: PosCartItem = {
  id: "1",
  barcode: "123",
  productName: "Shirt",
  size: "M",
  color: "Blue",
  quantity: 1,
  mrp: 1000,
  originalMrp: 1000,
  gstPer: 5,
  discountPercent: 0,
  discountAmount: 0,
  unitCost: 1000,
  netAmount: 1000,
  productId: "p1",
  variantId: "v1",
};

describe("posLineSalesman", () => {
  it("saleItemSalesmanFromCartLine trims and nulls blank", () => {
    expect(saleItemSalesmanFromCartLine("  RAVI  ")).toBe("RAVI");
    expect(saleItemSalesmanFromCartLine("")).toBeNull();
    expect(saleItemSalesmanFromCartLine(null)).toBeNull();
  });

  it("withDefaultLineSalesman stamps header when line unset", () => {
    expect(withDefaultLineSalesman(baseItem, "PRIYA").salesman).toBe("PRIYA");
    expect(withDefaultLineSalesman({ ...baseItem, salesman: "RAVI" }, "PRIYA").salesman).toBe("RAVI");
  });

  it("effectiveCartLineSalesman prefers line over header", () => {
    expect(effectiveCartLineSalesman({ salesman: "RAVI" }, "PRIYA")).toBe("RAVI");
    expect(effectiveCartLineSalesman({ salesman: null }, "PRIYA")).toBe("PRIYA");
    expect(effectiveCartLineSalesman({ salesman: null }, null)).toBe("");
  });

  it("defaultLineSalesmanFromHeader matches header trim", () => {
    expect(defaultLineSalesmanFromHeader(" MOHD ASHRAF ")).toBe("MOHD ASHRAF");
  });
});
