import { describe, expect, it } from "vitest";
import {
  A4_40_LABEL_39X35,
  A4_48_LABEL_48X24,
  computeA4SheetMargins,
  isNovaJetMpl40LGrid,
  isNovaJetMpl48LGrid,
  isNovaJetMpl48LLayout,
  novaJetBrandFromSheetType,
  resolveA4LabelWidthMm,
  resolveA4LayoutGap,
} from "./a4SheetLayout";

describe("novaJetBrandFromSheetType", () => {
  it("maps only explicit NovaJet sheet types", () => {
    expect(novaJetBrandFromSheetType("novajet40")).toBe("mpl40");
    expect(novaJetBrandFromSheetType("a4_12x4")).toBe("mpl48");
    // novajet48 is a different 8×6 × 33×19 sheet — not MPL 48L
    expect(novaJetBrandFromSheetType("novajet48")).toBeNull();
    expect(novaJetBrandFromSheetType("a4_40sheet")).toBeNull();
    expect(novaJetBrandFromSheetType("a4_39x35_40sheet")).toBeNull();
    expect(novaJetBrandFromSheetType("custom")).toBeNull();
    expect(novaJetBrandFromSheetType(null)).toBeNull();
  });
});

describe("NovaJet MPL 48L A4 margins", () => {
  it("detects the 48×24 4×12 grid even when gap is wrong", () => {
    expect(
      isNovaJetMpl48LGrid(
        A4_48_LABEL_48X24.cols,
        A4_48_LABEL_48X24.rows,
        A4_48_LABEL_48X24.labelWidthMm,
        A4_48_LABEL_48X24.labelHeightMm,
      ),
    ).toBe(true);
    expect(isNovaJetMpl48LLayout(4, 12, 48, 24, 1)).toBe(true);
    expect(isNovaJetMpl48LLayout(8, 6, 33, 19, 1)).toBe(false);
  });

  it("does not force gap from shape alone — needs mpl48 brand", () => {
    expect(resolveA4LayoutGap(4, 12, 48, 24, 1)).toBe(1);
    expect(resolveA4LayoutGap(4, 12, 48, 24, 1, null)).toBe(1);
    expect(resolveA4LayoutGap(4, 12, 48, 24, 1, "mpl48")).toBe(0);
    expect(resolveA4LayoutGap(4, 12, 48, 24, 0, "mpl48")).toBe(0);
  });

  it("uses TechNova 7.5mm top / 9mm left when brand is mpl48", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0, {}, "mpl48");
    expect(margins.marginTop).toBe(7.5);
    expect(margins.marginLeft).toBe(9);
    // 297 − 7.5 − 12×24 = 1.5mm bottom
    expect(margins.marginBottom).toBeCloseTo(1.5, 5);
    expect(margins.marginRight).toBe(9);
  });

  it("keeps TechNova margins when Gap is 1 and brand is mpl48", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 1, {}, "mpl48");
    expect(margins.marginTop).toBe(7.5);
    expect(margins.marginLeft).toBe(9);
    expect(margins.marginBottom).toBeCloseTo(1.5, 5);
  });

  it("centers a coincidental 4×12 × 48×24 custom/non-NovaJet sheet", () => {
    // Without brand: use caller's gap and center — do not force TechNova margins.
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0);
    expect(margins.marginTop).toBeCloseTo((297 - 12 * 24) / 2, 5);
    expect(margins.marginLeft).toBeCloseTo((210 - 4 * 48) / 2, 5);
  });

  it("applies positive top nudge downward from the TechNova base", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0, { top: 2 }, "mpl48");
    expect(margins.marginTop).toBe(9.5);
    expect(margins.marginBottom).toBeCloseTo(0, 5);
  });
});

describe("NovaJet MPL 40L A4 margins (39×35, 5×8)", () => {
  it("detects official 39×35 and hand-saved 38/40×35 5×8 grids (shape helper only)", () => {
    expect(isNovaJetMpl40LGrid(5, 8, 39, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 38, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 40, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 45, 35)).toBe(false);
    expect(isNovaJetMpl40LGrid(4, 12, 48, 24)).toBe(false);
  });

  it("does not coerce gap/width from shape alone — needs mpl40 brand", () => {
    expect(resolveA4LayoutGap(5, 8, 39, 35, 0.6)).toBe(0.6);
    expect(resolveA4LayoutGap(5, 8, 38, 35, 1)).toBe(1);
    expect(resolveA4LabelWidthMm(5, 8, 38, 35)).toBe(38);
    expect(resolveA4LabelWidthMm(5, 8, 40, 35)).toBe(40);

    const margins = computeA4SheetMargins(5, 8, 38, 35, 1);
    const contentW = 5 * 38 + 4 * 1;
    const contentH = 8 * 35 + 7 * 1;
    expect(margins.marginTop).toBeCloseTo((297 - contentH) / 2, 5);
    expect(margins.marginLeft).toBeCloseTo((210 - contentW) / 2, 5);
  });

  it("forces gap 0 and coerces 38mm→39mm when brand is mpl40", () => {
    expect(resolveA4LayoutGap(5, 8, 39, 35, 0.6, "mpl40")).toBe(0);
    expect(resolveA4LayoutGap(5, 8, 38, 35, 1, "mpl40")).toBe(0);
    expect(resolveA4LabelWidthMm(5, 8, 38, 35, 0, "mpl40")).toBe(39);
    expect(resolveA4LabelWidthMm(5, 8, 39, 35, undefined, "mpl40")).toBe(39);
    const margins38gap0 = computeA4SheetMargins(5, 8, 38, 35, 0, {}, "mpl40");
    expect(margins38gap0.marginTop).toBe(8.5);
    expect(margins38gap0.marginLeft).toBe(7.5);
  });

  it("coerces the 40×35 gap 2 preset when brand is mpl40", () => {
    expect(resolveA4LayoutGap(5, 8, 40, 35, 2, "mpl40")).toBe(0);
    expect(resolveA4LabelWidthMm(5, 8, 40, 35, undefined, "mpl40")).toBe(39);
    const margins = computeA4SheetMargins(5, 8, 40, 35, 2, {}, "mpl40");
    expect(margins.marginTop).toBe(8.5);
    expect(margins.marginLeft).toBe(7.5);
  });

  it("uses manufacturer 8.5mm top / 7.5mm left for novajet40 brand", () => {
    const margins = computeA4SheetMargins(5, 8, 39, 35, 0, {}, "mpl40");
    expect(margins.marginTop).toBe(A4_40_LABEL_39X35.sheetTopMarginMm);
    expect(margins.marginLeft).toBe(A4_40_LABEL_39X35.sheetLeftMarginMm);
    expect(margins.marginBottom).toBeCloseTo(8.5, 5);
    expect(margins.marginRight).toBeCloseTo(7.5, 5);
  });

  it("keeps die-cut pitch when brand is mpl40 and Gap=1 / width=38", () => {
    const margins = computeA4SheetMargins(5, 8, 38, 35, 1, {}, "mpl40");
    expect(margins.marginTop).toBe(8.5);
    expect(margins.marginLeft).toBe(7.5);
    expect(margins.marginBottom).toBeCloseTo(8.5, 5);
    expect(margins.marginRight).toBeCloseTo(7.5, 5);
  });

  it("still centers unrelated A4 grids", () => {
    const margins = computeA4SheetMargins(4, 9, 48, 30, 2);
    const contentH = 9 * 30 + 8 * 2;
    expect(margins.marginTop).toBeCloseTo((297 - contentH) / 2, 5);
  });
});
