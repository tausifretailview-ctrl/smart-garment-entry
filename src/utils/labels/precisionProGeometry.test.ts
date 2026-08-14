import { describe, expect, it } from "vitest";
import {
  BOX_BARCODE_MAX_W,
  BOX_W,
  LABEL_H,
  LABEL_W,
  PAIR_COL_W,
  PAIR_MID_Y,
  PAIR_TOP,
  PAIR_X,
  boxBarcodeNarrowBarWidth,
  boxSizeOverflowSafe,
  estimateCode128WidthDots,
} from "./precisionProGeometry";
import { generatePrecisionProTSCLabel } from "./precisionProTSPL";

describe("precisionProGeometry", () => {
  it("matches the 102×53mm die-cut plan at 203 DPI", () => {
    expect(LABEL_W).toBe(816);
    expect(LABEL_H).toBe(424);
    expect(BOX_W).toBe(512);
    expect(PAIR_X).toBe(512);
    expect(PAIR_COL_W).toBe(304);
    expect(PAIR_TOP).toBe(12);
    expect(PAIR_MID_Y).toBe(212);
    expect(BOX_W + PAIR_COL_W).toBe(LABEL_W);
  });

  it("drops barcode narrow width when Code128 would overflow the box", () => {
    const short = "123456789012";
    expect(estimateCode128WidthDots(short, 2)).toBeLessThanOrEqual(BOX_BARCODE_MAX_W);
    expect(boxBarcodeNarrowBarWidth(short)).toBe(2);

    const long = "ABCDEFGHIJKLMNOPQRSTUVWX";
    expect(estimateCode128WidthDots(long, 2)).toBeGreaterThan(BOX_BARCODE_MAX_W);
    expect(boxBarcodeNarrowBarWidth(long)).toBe(1);
  });

  it("keeps long sizes inside the box with a smaller face", () => {
    expect(boxSizeOverflowSafe("9").mulX).toBe(2);
    expect(boxSizeOverflowSafe("10").mulX).toBe(2);
    expect(boxSizeOverflowSafe("100").mulX).toBe(1);
    expect(boxSizeOverflowSafe("XL-L").font).toBe("3");
  });
});

describe("generatePrecisionProTSCLabel", () => {
  const sample = {
    businessName: "DEMO STORE",
    barcode: "8901234567890",
    productName: "RUNNER",
    style: "ART-42",
    brand: "BRAND",
    color: "BLACK",
    size: "9",
    salePrice: 999,
    mrp: 1299,
    category: "SHOE",
  };

  it("emits SIZE/GAP and no die-cut divider BARs by default", () => {
    const tspl = generatePrecisionProTSCLabel(sample, 2);
    expect(tspl).toContain("SIZE 102 mm, 53 mm");
    expect(tspl).toContain("GAP 2 mm, 0 mm");
    expect(tspl).toContain("PRINT 1,2");
    expect(tspl).toContain('ART NO : ART-42');
    expect(tspl).toContain('COLOUR : BLACK');
    expect(tspl).toContain("MRP : Rs.1299/-");
    // Pair stickers stay bare (no ART NO / COLOUR captions)
    expect(tspl).toMatch(new RegExp(`TEXT ${PAIR_X},\\d+,"1",0,1,1,"ART-42"`));
    expect(tspl).not.toMatch(/^BAR /m);
  });

  it("places pair panels at PAIR_TOP and PAIR_MID_Y", () => {
    const tspl = generatePrecisionProTSCLabel(sample, 1);
    expect(tspl).toContain(`TEXT ${PAIR_X},${PAIR_TOP + 4}`);
    expect(tspl).toContain(`TEXT ${PAIR_X},${PAIR_MID_Y + 4}`);
  });
});
