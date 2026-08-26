import { describe, expect, it } from "vitest";
import { resolveBarcodeScanPicker } from "@/utils/barcodeMrpPicker";

const inStock = (m: { variant: { stock_qty?: number } }) => Number(m.variant.stock_qty ?? 0) > 0;

describe("resolveBarcodeScanPicker", () => {
  it("auto-picks a single match", () => {
    const match = { product: { id: "p1" }, variant: { id: "v1", mrp: 204.5, stock_qty: 2 } };
    const result = resolveBarcodeScanPicker([match], inStock);
    expect(result.autoPick).toBe(match);
    expect(result.showMrpDialog).toBe(false);
  });

  it("opens MRP dialog for duplicate barcode at different MRP tiers", () => {
    const matches = [
      { product: { id: "p1" }, variant: { id: "v1", mrp: 164.5, stock_qty: 1 } },
      { product: { id: "p1" }, variant: { id: "v2", mrp: 204.5, stock_qty: 0 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.needMrpPicker).toBe(true);
    expect(result.showMrpDialog).toBe(true);
    expect(result.mrpDialogChoices).toHaveLength(2);
    expect(result.showProductPicker).toBe(false);
  });

  it("uses product picker when duplicates share the same MRP tier", () => {
    const matches = [
      { product: { id: "p1" }, variant: { id: "v1", mrp: 204.5, stock_qty: 2 } },
      { product: { id: "p2" }, variant: { id: "v2", mrp: 204.5, stock_qty: 3 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.showMrpDialog).toBe(false);
    expect(result.showProductPicker).toBe(true);
    expect(result.productPickerChoices).toHaveLength(2);
  });
});
