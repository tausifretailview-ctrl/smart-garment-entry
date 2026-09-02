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

  it("opens MRP dialog for duplicate barcode at different MRP tiers when both are in stock", () => {
    const matches = [
      { product: { id: "p1" }, variant: { id: "v1", mrp: 164.5, stock_qty: 1 } },
      { product: { id: "p1" }, variant: { id: "v2", mrp: 204.5, stock_qty: 2 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.needMrpPicker).toBe(true);
    expect(result.showMrpDialog).toBe(true);
    expect(result.mrpDialogChoices).toHaveLength(2);
    expect(result.showProductPicker).toBe(false);
  });

  it("hides zero-stock sale-price tiers and auto-picks the only in-stock SKU", () => {
    const inStockMatch = {
      product: { id: "p1" },
      variant: { id: "v-445", mrp: 0, sale_price: 445, stock_qty: 2 },
    };
    const matches = [
      inStockMatch,
      { product: { id: "p1" }, variant: { id: "v-425-zero", mrp: 0, sale_price: 425, stock_qty: 0 } },
      { product: { id: "p1" }, variant: { id: "v-42", mrp: 0, sale_price: 42, stock_qty: 0 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.showMrpDialog).toBe(false);
    expect(result.autoPick).toBe(inStockMatch);
  });

  it("shows only in-stock sale-price tiers (SONARI BRA 445+425, hide stock 0)", () => {
    const matches = [
      { product: { id: "p1" }, variant: { id: "v-445", mrp: 0, sale_price: 445, stock_qty: 2 } },
      { product: { id: "p1" }, variant: { id: "v-425", mrp: 0, sale_price: 425, stock_qty: 1 } },
      { product: { id: "p1" }, variant: { id: "v-425-zero", mrp: 0, sale_price: 425, stock_qty: 0 } },
      { product: { id: "p1" }, variant: { id: "v-42", mrp: 0, sale_price: 42, stock_qty: 0 } },
      { product: { id: "p1" }, variant: { id: "v-4", mrp: 0, sale_price: 4, stock_qty: 0 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.showMrpDialog).toBe(true);
    expect(result.mrpDialogChoices.map((c) => c.variant.id)).toEqual(["v-445", "v-425"]);
  });

  it("still lists zero-stock tiers when every SKU is out of stock", () => {
    const matches = [
      { product: { id: "p1" }, variant: { id: "v1", mrp: 0, sale_price: 425, stock_qty: 0 } },
      { product: { id: "p1" }, variant: { id: "v2", mrp: 0, sale_price: 445, stock_qty: 0 } },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.showMrpDialog).toBe(true);
    expect(result.mrpDialogChoices).toHaveLength(2);
  });

  it("opens price dialog when tiers differ by sale_price only (MRP feature off)", () => {
    const matches = [
      {
        product: { id: "p1", product_name: "BOXER BRIEF" },
        variant: { id: "v1", mrp: 0, sale_price: 549, stock_qty: 14 },
      },
      {
        product: { id: "p2", product_name: "BOXER BRIEF" },
        variant: { id: "v2", mrp: 0, sale_price: 569, stock_qty: 0 },
      },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.needMrpPicker).toBe(true);
    expect(result.showMrpDialog).toBe(false);
    expect(result.autoPick?.variant.id).toBe("v1");
  });

  it("opens MRP dialog when tiers differ via product default_sale_price", () => {
    const matches = [
      {
        product: { id: "p1", default_sale_price: 549 },
        variant: { id: "v1", mrp: 0, sale_price: 0, stock_qty: 2 },
      },
      {
        product: { id: "p2", default_sale_price: 569 },
        variant: { id: "v2", mrp: 0, sale_price: 0, stock_qty: 1 },
      },
    ];
    const result = resolveBarcodeScanPicker(matches, inStock);
    expect(result.showMrpDialog).toBe(true);
    expect(result.mrpDialogChoices).toHaveLength(2);
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
