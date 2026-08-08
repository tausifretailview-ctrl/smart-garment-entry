import { describe, expect, it } from "vitest";
import {
  findMatchingA4SheetType,
  parseLabelSizeFromTemplateName,
  resolveStandardSheetTypeForLabelDimensions,
  thermal1UpSheetTypeKey,
} from "./labelTemplateDimensions";

/** Minimal sheet registry mirroring BarcodePrinting.sheetPresets for resolver tests. */
const sheetPresets = {
  novajet48: { cols: 8, rows: 6, width: "33mm", height: "19mm", gap: "1mm", category: "a4" },
  novajet40: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_40sheet: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_39x35_40sheet: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_12x4: { cols: 4, rows: 12, width: "48mm", height: "24mm", gap: "0mm", category: "a4" },
  a4_35x37: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm", category: "a4" },
  thermal_50x38_1up: {
    cols: 1,
    width: "50mm",
    height: "38mm",
    gap: "0mm",
    category: "thermal",
    thermal: true,
  },
  custom: { cols: 4, width: "50mm", height: "25mm", gap: "2mm", category: "custom" },
};

describe("parseLabelSizeFromTemplateName", () => {
  it("parses bansari-style and × separators", () => {
    expect(parseLabelSizeFromTemplateName("bansari creation 39*35")).toEqual({
      width: 39,
      height: 35,
    });
    expect(parseLabelSizeFromTemplateName("MPL 40L 39×35")).toEqual({ width: 39, height: 35 });
  });
});

describe("resolveStandardSheetTypeForLabelDimensions", () => {
  it("prefers thermal 1-up when present", () => {
    expect(resolveStandardSheetTypeForLabelDimensions(50, 38, sheetPresets)).toEqual({
      sheetType: thermal1UpSheetTypeKey(50, 38),
    });
  });

  it("maps 39×35 to A4 40-sheet (not custom 1×1) — Bansari / MPL 40L", () => {
    const resolved = resolveStandardSheetTypeForLabelDimensions(39, 35, sheetPresets);
    expect(resolved.sheetType).toBe("a4_40sheet");
    expect(resolved.custom).toBeUndefined();
  });

  it("honors 5×8 grid when choosing among 39×35 aliases", () => {
    expect(
      findMatchingA4SheetType(39, 35, sheetPresets, { cols: 5, rows: 8 }),
    ).toBe("a4_40sheet");
  });

  it("maps 48×24 to NovaJet MPL 48L", () => {
    expect(resolveStandardSheetTypeForLabelDimensions(48, 24, sheetPresets)).toEqual({
      sheetType: "a4_12x4",
    });
  });

  it("falls back to custom with provided A4 grid when size is unknown", () => {
    expect(
      resolveStandardSheetTypeForLabelDimensions(41, 36, sheetPresets, {
        cols: 5,
        rows: 8,
        gap: 0,
      }),
    ).toEqual({
      sheetType: "custom",
      custom: { width: 41, height: 36, cols: 5, rows: 8, gap: 0 },
    });
  });

  it("falls back to custom 1×1 for unknown size without grid hints", () => {
    expect(resolveStandardSheetTypeForLabelDimensions(41, 36, sheetPresets)).toEqual({
      sheetType: "custom",
      custom: { width: 41, height: 36, cols: 1, rows: 1, gap: 0 },
    });
  });
});
