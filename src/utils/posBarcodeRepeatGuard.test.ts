import { beforeEach, describe, expect, it } from "vitest";
import {
  POS_BARCODE_REPEAT_WINDOW_MS,
  recordPosBarcodeScanSuccess,
  resetPosBarcodeRepeatGuard,
  shouldSwallowPosRepeatBarcodeScan,
} from "./posBarcodeRepeatGuard";

describe("posBarcodeRepeatGuard", () => {
  beforeEach(() => resetPosBarcodeRepeatGuard());

  it("swallows a double-fire of the same scan right after an add", () => {
    recordPosBarcodeScanSuccess("100003625", 1_000);
    expect(shouldSwallowPosRepeatBarcodeScan("100003625", 1_050)).toBe(true);
  });

  it("lets a deliberate rescan of the same barcode add again (was blocked for 5s)", () => {
    recordPosBarcodeScanSuccess("100003625", 1_000);
    expect(shouldSwallowPosRepeatBarcodeScan("100003625", 1_000 + POS_BARCODE_REPEAT_WINDOW_MS)).toBe(false);
    expect(shouldSwallowPosRepeatBarcodeScan("100003625", 2_000)).toBe(false);
  });

  it("does not affect other barcodes or empty input", () => {
    recordPosBarcodeScanSuccess("100003625", 1_000);
    expect(shouldSwallowPosRepeatBarcodeScan("100003626", 1_010)).toBe(false);
    expect(shouldSwallowPosRepeatBarcodeScan("  ", 1_010)).toBe(false);
  });

  it("matches ignoring surrounding spaces", () => {
    recordPosBarcodeScanSuccess(" 100003625 ", 1_000);
    expect(shouldSwallowPosRepeatBarcodeScan("100003625", 1_020)).toBe(true);
  });
});
