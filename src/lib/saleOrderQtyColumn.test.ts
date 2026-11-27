import { describe, expect, it } from "vitest";
import { buildSaleOrderQtyLookup, saleOrderQtyHint, type SaleOrderLineQty } from "./saleOrderInvoiceLink";

const row = (patch: Partial<SaleOrderLineQty>): SaleOrderLineQty => ({
  variant_id: null, product_id: null, barcode: null, size: null, color: null,
  order_qty: 0, fulfilled_qty: 0, pending_qty: null, ...patch,
});

describe("Sale Bill ORDER QTY column: bill line → order quantity", () => {
  it("matches by item id, then barcode, then product + size + colour", () => {
    const find = buildSaleOrderQtyLookup([
      row({ variant_id: "v1", barcode: "J20097", product_id: "p1", size: "8", order_qty: 6 }),
      row({ barcode: "J20098", order_qty: 4 }),
      row({ product_id: "p2", size: "L", color: "Red", order_qty: 3 }),
    ]);
    expect(find({ variantId: "v1" })?.required).toBe(6);
    expect(find({ variantId: "other", barcode: " j20097 " })?.required).toBe(6);
    expect(find({ barcode: "J20098" })?.required).toBe(4);
    expect(find({ productId: "p2", size: "l", color: "RED" })?.required).toBe(3);
    expect(find({ productId: "p2", size: "XL", color: "Red" })).toBeNull();
    expect(find({ variantId: "v9", barcode: "X" })).toBeNull();
  });

  it("the same item on two order lines is added up; the same key for lines that point to one item", () => {
    const find = buildSaleOrderQtyLookup([
      row({ variant_id: "v1", barcode: "J1", order_qty: 2 }),
      row({ variant_id: "v1", barcode: "J1", order_qty: 3 }),
    ]);
    const a = find({ variantId: "v1" })!;
    const b = find({ barcode: "J1" })!;
    expect(a.required).toBe(5);
    expect(b.key).toBe(a.key);
  });

  it("part already delivered: the pending quantity is required", () => {
    const find = buildSaleOrderQtyLookup([row({ variant_id: "v1", order_qty: 10, fulfilled_qty: 4, pending_qty: 6 })]);
    expect(find({ variantId: "v1" })).toMatchObject({ required: 6, ordered: 10, delivered: 4 });
  });

  it("hint: short, extra or matches", () => {
    expect(saleOrderQtyHint(6, 1)).toEqual({ text: "5 short", tone: "short" });
    expect(saleOrderQtyHint(2, 3)).toEqual({ text: "1 extra", tone: "extra" });
    expect(saleOrderQtyHint(4, 4)).toEqual({ text: "matches", tone: "match" });
    expect(saleOrderQtyHint(1.5, 1.25).text).toBe("0.25 short");
  });
});
