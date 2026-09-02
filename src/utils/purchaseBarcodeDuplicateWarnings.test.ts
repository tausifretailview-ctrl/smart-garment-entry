import { describe, expect, it } from "vitest";
import {
  buildBarcodeDuplicateWarnings,
  shouldFlagPurchaseBarcodeDuplicate,
} from "./purchaseBarcodeDuplicateWarnings";

const CHIRAG_ORG = { organizationNumber: 45, barcodeDigits: 9 };

describe("shouldFlagPurchaseBarcodeDuplicate", () => {
  it("does not flag manufacturer EAN-13 (Jockey 8901326331101 restock)", () => {
    expect(shouldFlagPurchaseBarcodeDuplicate("8901326331101", CHIRAG_ORG)).toBe(false);
    expect(
      shouldFlagPurchaseBarcodeDuplicate("8901326331101", CHIRAG_ORG, "external"),
    ).toBe(false);
  });

  it("flags this org's generated series (Chirag 450006800)", () => {
    expect(shouldFlagPurchaseBarcodeDuplicate("450006800", CHIRAG_ORG)).toBe(true);
    expect(shouldFlagPurchaseBarcodeDuplicate("450006800", CHIRAG_ORG, "generated")).toBe(
      true,
    );
  });

  it("does not flag another org's numeric series as ours", () => {
    expect(shouldFlagPurchaseBarcodeDuplicate("220001025", CHIRAG_ORG)).toBe(false);
  });

  it("does not flag alphanumeric brand serials", () => {
    expect(shouldFlagPurchaseBarcodeDuplicate("SHHY62451C4Z263MA", CHIRAG_ORG)).toBe(false);
  });
});

describe("buildBarcodeDuplicateWarnings", () => {
  const existingJockey = {
    variant_id: "sku-old-jockey",
    product_name: "JOCKEY BRA",
    size: "None",
    color: null,
    stock_qty: 5,
    barcode: "8901326331101",
  };
  const existingJeans = {
    variant_id: "sku-old-jeans",
    product_name: "JEANS",
    size: "28",
    color: null,
    stock_qty: 0,
    barcode: "450006800",
  };

  it("does not show already-used for a repeating universal EAN on a new purchase line", () => {
    const lookup = new Map([["8901326331101", [existingJockey]]]);
    const warnings = buildBarcodeDuplicateWarnings(
      [
        {
          temp_id: "row-1",
          barcode: "8901326331101",
          sku_id: "sku-new-ancel",
        },
      ],
      lookup,
      false,
      [],
      CHIRAG_ORG,
    );
    expect(warnings.size).toBe(0);
  });

  it("shows already-used for a duplicate in our generated series", () => {
    const lookup = new Map([["450006800", [existingJeans]]]);
    const warnings = buildBarcodeDuplicateWarnings(
      [
        {
          temp_id: "row-1",
          barcode: "450006800",
          sku_id: "sku-new-jeans",
          barcode_source: "generated",
        },
      ],
      lookup,
      false,
      [],
      CHIRAG_ORG,
    );
    expect(warnings.get("row-1")).toMatch(/Barcode already used: "JEANS" 28 \(Stock: 0\)/);
  });

  it("does not treat two Jockey EAN lines in one bill as a duplicate conflict", () => {
    const warnings = buildBarcodeDuplicateWarnings(
      [
        { temp_id: "a", barcode: "8901326331101", sku_id: "sku-729" },
        { temp_id: "b", barcode: "8901326331101", sku_id: "sku-749" },
      ],
      new Map(),
      false,
      [],
      CHIRAG_ORG,
    );
    expect(warnings.size).toBe(0);
  });

  it("warns when two generated-series lines in one bill share a barcode", () => {
    const warnings = buildBarcodeDuplicateWarnings(
      [
        { temp_id: "a", barcode: "450006800", sku_id: "sku-1" },
        { temp_id: "b", barcode: "450006800", sku_id: "sku-2" },
      ],
      new Map(),
      false,
      [],
      CHIRAG_ORG,
    );
    expect(warnings.get("a")).toMatch(/Duplicate barcode in this bill/);
    expect(warnings.get("b")).toMatch(/Duplicate barcode in this bill/);
  });
});
