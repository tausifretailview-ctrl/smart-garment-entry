import { describe, expect, it } from "vitest";
import {
  A4_48_LABEL_48X24,
  computeA4SheetMargins,
  isNovaJetMpl48LLayout,
} from "./a4SheetLayout";

describe("NovaJet MPL 48L A4 margins", () => {
  it("detects the 48×24 4×12 zero-gap layout", () => {
    expect(
      isNovaJetMpl48LLayout(
        A4_48_LABEL_48X24.cols,
        A4_48_LABEL_48X24.rows,
        A4_48_LABEL_48X24.labelWidthMm,
        A4_48_LABEL_48X24.labelHeightMm,
        A4_48_LABEL_48X24.gapMm,
      ),
    ).toBe(true);
    expect(isNovaJetMpl48LLayout(8, 6, 33, 19, 1)).toBe(false);
  });

  it("uses TechNova 7.5mm top / 9mm left — not vertical centering", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0);
    expect(margins.marginTop).toBe(7.5);
    expect(margins.marginLeft).toBe(9);
    // 297 − 7.5 − 12×24 = 1.5mm bottom
    expect(margins.marginBottom).toBeCloseTo(1.5, 5);
    expect(margins.marginRight).toBe(9);
  });

  it("applies positive top nudge downward from the TechNova base", () => {
    const margins = computeA4SheetMargins(4, 12, 48, 24, 0, { top: 2 });
    expect(margins.marginTop).toBe(9.5);
    expect(margins.marginBottom).toBeCloseTo(0, 5);
  });

  it("still centers other A4 grids", () => {
    // 5×8 of 38×35 with 1mm gap — not 48L
    const margins = computeA4SheetMargins(5, 8, 38, 35, 1);
    const contentH = 8 * 35 + 7 * 1;
    expect(margins.marginTop).toBeCloseTo((297 - contentH) / 2, 5);
  });
});
