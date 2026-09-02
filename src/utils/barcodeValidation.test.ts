import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  formatBarcodeConflictMessage,
  normalizeBarcodes,
  effectiveBarcodePriceTier,
  isBarcodeOrgConflict,
} from "./barcodeValidation";

describe("normalizeBarcodes", () => {
  it("trims and dedupes barcodes", () => {
    expect(normalizeBarcodes([" 501 ", "501", "", "502"])).toEqual(["501", "502"]);
  });
});

describe("effectiveBarcodePriceTier / isBarcodeOrgConflict", () => {
  it("prefers MRP over sale price for the tier key", () => {
    expect(effectiveBarcodePriceTier({ salePrice: 409, mrp: 499 })).toBe(499);
    expect(effectiveBarcodePriceTier({ salePrice: 409, mrp: null })).toBe(409);
  });

  it("allows same branded EAN at a different MRP", () => {
    expect(
      isBarcodeOrgConflict({
        existing: { salePrice: 409, mrp: 409 },
        incoming: { salePrice: 450, mrp: 450 },
      }),
    ).toBe(false);
  });

  it("blocks same branded EAN at the same MRP", () => {
    expect(
      isBarcodeOrgConflict({
        existing: { salePrice: 409, mrp: 409 },
        incoming: { salePrice: 409, mrp: 409 },
      }),
    ).toBe(true);
  });

  it("allows same branded EAN when MRP is identical but sale price differs (JOCKEY BRA case)", () => {
    expect(
      isBarcodeOrgConflict({
        existing: { salePrice: 400, mrp: 200 },
        incoming: { salePrice: 500, mrp: 200 },
      }),
    ).toBe(false);
  });

  it("always blocks IMEI / serialized units regardless of price", () => {
    expect(
      isBarcodeOrgConflict({
        existingRequiresImei: true,
        existing: { salePrice: 100, mrp: 100 },
        incoming: { salePrice: 200, mrp: 200 },
      }),
    ).toBe(true);
  });
});

describe("formatBarcodeConflictMessage", () => {
  it("lists barcode and product name", () => {
    expect(
      formatBarcodeConflictMessage([
        { barcode: "501", productName: "Service A" },
        { barcode: "501", productName: "Service A" },
        { barcode: "502", productName: "Service B" },
      ]),
    ).toBe('"501" (Service A), "502" (Service B)');
  });

  it("includes price tier when present", () => {
    expect(
      formatBarcodeConflictMessage([
        { barcode: "8901", productName: "TRUNK", salePrice: 409, mrp: 409 },
      ]),
    ).toBe('"8901" (TRUNK @ ₹409)');
  });
});
