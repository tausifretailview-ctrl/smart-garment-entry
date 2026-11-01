import { describe, expect, it } from "vitest";
import { addLine } from "./cartMutators";

const product = { id: "p1", product_name: "KURTI", gst_per: 5 };
const variant = { id: "v1", barcode: "500001", size: "M", sale_price: 650, mrp: 1350, stock_qty: 5 };

describe("addLine — shop MRP setting off (ignoreMrp)", () => {
  it("keeps the item MRP when MRP is on", () => {
    const { items } = addLine({ items: [], product, variant, grossBasis: "sale_price", garmentGstSettings: null });
    expect(items[0].mrp).toBe(1350);
    expect(items[0].unitCost).toBe(650);
  });

  it("uses the sale price as MRP when MRP is off, so no hidden discount", () => {
    const { items } = addLine({
      items: [],
      product,
      variant,
      grossBasis: "sale_price",
      garmentGstSettings: null,
      ignoreMrp: true,
    });
    expect(items[0].mrp).toBe(650);
    expect(items[0].unitCost).toBe(650);
    expect(items[0].netAmount).toBe(650);
  });

  it("also ignores a picked MRP tier when MRP is off", () => {
    const { items } = addLine({
      items: [],
      product,
      variant,
      grossBasis: "sale_price",
      garmentGstSettings: null,
      overridePrice: { sale_price: 600, mrp: 1200 },
      ignoreMrp: true,
    });
    expect(items[0].mrp).toBe(600);
    expect(items[0].unitCost).toBe(600);
  });
});
