import { describe, expect, it } from "vitest";
import {
  A4_40_LABEL_39X35,
  A4_48_LABEL_48X24,
  computeA4SheetMargins,
  isNovaJetMpl40LGrid,
  isNovaJetMpl48LGrid,
  isNovaJetMpl48LLayout,
  resolveA4LabelWidthMm,
  resolveA4LayoutGap,
} from "./a4SheetLayout";

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

  it("forces layout gap to 0 for 48×24 4×12 custom presets", () => {
    expect(resolveA4LayoutGap(4, 12, 48, 24, 1)).toBe(0);
    expect(resolveA4LayoutGap(4, 12, 48, 24, 0)).toBe(0);
  });

  it("uses TechNova 7.5mm top / 9mm left — not vertical centering", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0);
    expect(margins.marginTop).toBe(7.5);
    expect(margins.marginLeft).toBe(9);
    // 297 − 7.5 − 12×24 = 1.5mm bottom
    expect(margins.marginBottom).toBeCloseTo(1.5, 5);
    expect(margins.marginRight).toBe(9);
  });

  it("keeps TechNova margins when custom preset Gap is 1 (common mistake)", () => {
    // Without coercion, contentH=299 > A4 and baseTop collapses to 0.
    const margins = computeA4SheetMargins(4, 12, 48, 24, 1);
    expect(margins.marginTop).toBe(7.5);
    expect(margins.marginLeft).toBe(9);
    expect(margins.marginBottom).toBeCloseTo(1.5, 5);
  });

  it("applies positive top nudge downward from the TechNova base", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0, { top: 2 });
    expect(margins.marginTop).toBe(9.5);
    expect(margins.marginBottom).toBeCloseTo(0, 5);
  });
});

describe("NovaJet MPL 40L A4 margins (39×35, 5×8)", () => {
  it("detects official 39×35 and hand-saved 38/40×35 5×8 grids", () => {
    expect(isNovaJetMpl40LGrid(5, 8, 39, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 38, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 40, 35)).toBe(true);
    expect(isNovaJetMpl40LGrid(5, 8, 45, 35)).toBe(false);
    expect(isNovaJetMpl40LGrid(4, 12, 48, 24)).toBe(false);
  });

  it("forces gap 0 and coerces legacy 38mm width to 39mm", () => {
    expect(resolveA4LayoutGap(5, 8, 39, 35, 0.6)).toBe(0);
    expect(resolveA4LayoutGap(5, 8, 38, 35, 1)).toBe(0);
    expect(resolveA4LabelWidthMm(5, 8, 38, 35)).toBe(39);
    expect(resolveA4LabelWidthMm(5, 8, 39, 35)).toBe(39);
  });

  it("coerces the 40×35 gap 2 preset back to the die-cut pitch", () => {
    expect(resolveA4LayoutGap(5, 8, 40, 35, 2)).toBe(0);
    expect(resolveA4LabelWidthMm(5, 8, 40, 35)).toBe(39);
    const margins = computeA4SheetMargins(5, 8, 40, 35, 2);
    expect(margins.marginTop).toBe(8.5);
    expect(margins.marginLeft).toBe(7.5);
  });

  it("uses manufacturer 8.5mm top / 7.5mm left", () => {
    const margins = computeA4SheetMargins(5, 8, 39, 35, 0);
    expect(margins.marginTop).toBe(A4_40_LABEL_39X35.sheetTopMarginMm);
    expect(margins.marginLeft).toBe(A4_40_LABEL_39X35.sheetLeftMarginMm);
    expect(margins.marginBottom).toBeCloseTo(8.5, 5);
    expect(margins.marginRight).toBeCloseTo(7.5, 5);
  });

  it("keeps die-cut pitch when custom Gap=1 / width=38 (common mistake)", () => {
    const margins = computeA4SheetMargins(5, 8, 38, 35, 1);
    expect(margins.marginTop).toBe(8.5);
    expect(margins.marginLeft).toBe(7.5);
    // contentW = 5×39 = 195 → right = 7.5; contentH = 8×35 = 280 → bottom = 8.5
    expect(margins.marginBottom).toBeCloseTo(8.5, 5);
    expect(margins.marginRight).toBeCloseTo(7.5, 5);
  });

  it("still centers unrelated A4 grids", () => {
    // 4×9 of 48×30 with 2mm gap — not 40L / 48L
    const margins = computeA4SheetMargins(4, 9, 48, 30, 2);
    const contentH = 9 * 30 + 8 * 2;
    expect(margins.marginTop).toBeCloseTo((297 - contentH) / 2, 5);
  });
});
