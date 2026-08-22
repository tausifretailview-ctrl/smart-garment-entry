import { describe, expect, it } from "vitest";
import {
  POS_PARTIAL_BARCODE_MIN_LEN,
  POS_SHORT_NUMERIC_BARCODE_MIN_LEN,
  canResolvePosPurchaseBarcode,
  posNumericBarcodeAutoSubmitMinLen,
  shouldUsePartialPosBarcodeMatch,
} from "./posBarcodeLookup";

describe("posBarcodeLookup", () => {
  it("allows 3-digit service barcodes to auto-submit outside IMEI mode", () => {
    expect(posNumericBarcodeAutoSubmitMinLen({ enabled: false })).toBe(
      POS_SHORT_NUMERIC_BARCODE_MIN_LEN,
    );
    expect(posNumericBarcodeAutoSubmitMinLen({ enabled: false })).toBeLessThanOrEqual(3);
  });

  it("requires full IMEI length when IMEI enforcement is on", () => {
    expect(
      posNumericBarcodeAutoSubmitMinLen({
        enabled: true,
        imei_scan_enforcement: true,
        imei_min_length: 15,
      }),
    ).toBe(15);
  });

  it("resolves purchase barcodes from 3 digits up (501 service codes)", () => {
    expect(canResolvePosPurchaseBarcode("501")).toBe(true);
    expect(canResolvePosPurchaseBarcode("12")).toBe(false);
  });

  it("skips partial substring match for short numeric codes", () => {
    expect(shouldUsePartialPosBarcodeMatch("501")).toBe(false);
    expect(shouldUsePartialPosBarcodeMatch("123456")).toBe(true);
    expect(POS_PARTIAL_BARCODE_MIN_LEN).toBeGreaterThan(3);
  });
});
