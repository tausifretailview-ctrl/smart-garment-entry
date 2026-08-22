import { describe, expect, it } from "vitest";
import {
  isCompleteNumericBarcodeForPosCart,
  POS_NUMERIC_BARCODE_MIN_LENGTH,
  shouldPosEnterUseExactBarcodeLookup,
} from "./posBarcodeCartLookup";

describe("posBarcodeCartLookup", () => {
  it("requires at least 8 digits for numeric cart barcodes", () => {
    expect(POS_NUMERIC_BARCODE_MIN_LENGTH).toBe(8);
    expect(isCompleteNumericBarcodeForPosCart("0040")).toBe(false);
    expect(isCompleteNumericBarcodeForPosCart("0040011")).toBe(false);
    expect(isCompleteNumericBarcodeForPosCart("00400114")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("0040017429")).toBe(true);
  });

  it("rejects non-numeric strings", () => {
    expect(isCompleteNumericBarcodeForPosCart("SHIRT")).toBe(false);
    expect(isCompleteNumericBarcodeForPosCart("0040abc")).toBe(false);
  });

  it("trims whitespace before length check", () => {
    expect(isCompleteNumericBarcodeForPosCart("  0040011442  ")).toBe(true);
  });
});

describe("shouldPosEnterUseExactBarcodeLookup", () => {
  it("numeric barcode Enter uses exact lookup, not dropdown partial pick", () => {
    expect(shouldPosEnterUseExactBarcodeLookup("0040017429")).toBe(true);
    expect(shouldPosEnterUseExactBarcodeLookup("0040")).toBe(true);
  });

  it("text search Enter may use dropdown pick", () => {
    expect(shouldPosEnterUseExactBarcodeLookup("SHIRT")).toBe(false);
    expect(shouldPosEnterUseExactBarcodeLookup("BHG215")).toBe(false);
  });

  it("quick service codes use dropdown path", () => {
    expect(shouldPosEnterUseExactBarcodeLookup("3")).toBe(false);
  });
});
