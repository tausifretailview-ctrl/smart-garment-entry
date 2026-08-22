import { describe, expect, it } from "vitest";
import {
  POS_NUMERIC_BARCODE_MIN_LENGTH,
cursor/ks-footwear-pos-barcode-mrp-fix-0051
  shouldPosEnterUseExactBarcodeLookup,
<<<<<<< HEAD
=======
  isCompleteNumericBarcodeForPosCart,
  isPosServiceShortNumericBarcode,
 main
=======
  stockReportOldBarcodeKeyMatches,
>>>>>>> a93c713da (Stock Report: require Search/Enter for barcode; exact numeric match)
} from "./posBarcodeCartLookup";

describe("posBarcodeCartLookup", () => {
  it("accepts 3–7 digit service barcodes (501) for POS cart lookup", () => {
    expect(isPosServiceShortNumericBarcode("501")).toBe(true);
    expect(isPosServiceShortNumericBarcode("8001")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("501")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("8001")).toBe(true);
  });

  it("still requires 8+ digits for long retail EAN-style codes", () => {
    expect(isCompleteNumericBarcodeForPosCart("1234567")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("12345678")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("12")).toBe(false);
    expect(POS_NUMERIC_BARCODE_MIN_LENGTH).toBe(8);
  });

  it("allows single-digit quick service codes 1–9", () => {
    expect(isCompleteNumericBarcodeForPosCart("5")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("0")).toBe(false);
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

describe("stockReportOldBarcodeKeyMatches", () => {
  it("exact match for numeric barcode keys", () => {
    expect(stockReportOldBarcodeKeyMatches("0040017429", "0040017429")).toBe(true);
    expect(stockReportOldBarcodeKeyMatches("0040", "0040017429")).toBe(false);
  });

  it("substring match for text keys", () => {
    expect(stockReportOldBarcodeKeyMatches("bhg", "label-bhg215")).toBe(true);
  });
});
