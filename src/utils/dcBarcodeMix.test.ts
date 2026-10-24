import { describe, expect, it } from "vitest";
import { dcMixConfirmMessage, findDcMixedBarcodes, pickDcMixedBarcodes } from "./dcBarcodeMix";

describe("dcBarcodeMix", () => {
  const rows = [
    { id: "a", barcode: "111", stock_qty: 4, is_dc_product: false },
    { id: "b", barcode: "222", stock_qty: 2, is_dc_product: true },
    { id: "c", barcode: "333", stock_qty: 0, is_dc_product: false },
    { id: "d", barcode: "444", stock_qty: 3, is_dc_product: null },
  ];

  it("on a DC bill, flags barcodes that hold GST stock", () => {
    expect(pickDcMixedBarcodes(rows, true).map((m) => m.barcode)).toEqual(["111", "444"]);
  });

  it("on a GST bill, flags barcodes that hold DC stock", () => {
    expect(pickDcMixedBarcodes(rows, false).map((m) => m.barcode)).toEqual(["222"]);
  });

  it("never blocks the save when the lookup fails", async () => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    };
    await expect(findDcMixedBarcodes({ from: () => q }, "org", [{ sku_id: "a" }], true)).resolves.toEqual([]);
  });

  it("names the barcodes and the choice", () => {
    const msg = dcMixConfirmMessage(pickDcMixedBarcodes(rows, true), true);
    expect(msg).toContain("111 (stock 4)");
    expect(msg).toContain("new barcode");
    expect(msg).toContain("OK = save anyway");
  });
});
