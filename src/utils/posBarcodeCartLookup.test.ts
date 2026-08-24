import { describe, expect, it } from "vitest";
import {
  isCompleteNumericBarcodeForPosCart,
  isPosServiceShortNumericBarcode,
  POS_NUMERIC_BARCODE_MIN_LENGTH,
  shouldPosEnterUseExactBarcodeLookup,
  stockReportOldBarcodeKeyMatches,
} from "./posBarcodeCartLookup";

describe("posBarcodeCartLookup", () => {
  it("accepts 2–7 digit service barcodes (10, 18, 501) for POS cart lookup", () => {
    expect(isCompleteNumericBarcodeForPosCart("10")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("18")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("19")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("501")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("8001")).toBe(true);
    expect(isPosServiceShortNumericBarcode("18")).toBe(true);
  });

  it("still requires 8+ digits for long retail EAN-style codes", () => {
    expect(isCompleteNumericBarcodeForPosCart("004001")).toBe(false);
    expect(isPosServiceShortNumericBarcode("004001")).toBe(false);
    expect(isPosServiceShortNumericBarcode("04")).toBe(false);
    expect(isCompleteNumericBarcodeForPosCart("04")).toBe(false);

    expect(isCompleteNumericBarcodeForPosCart("00400114")).toBe(true);
    expect(isCompleteNumericBarcodeForPosCart("0040017429")).toBe(true);
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

  it("two-digit catering service codes use exact barcode lookup on Enter", () => {
    expect(shouldPosEnterUseExactBarcodeLookup("10")).toBe(true);
    expect(shouldPosEnterUseExactBarcodeLookup("18")).toBe(true);
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
