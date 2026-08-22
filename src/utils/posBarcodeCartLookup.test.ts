import { describe, expect, it } from "vitest";
import {
  isCompleteNumericBarcodeForPosCart,
  POS_NUMERIC_BARCODE_MIN_LENGTH,
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
