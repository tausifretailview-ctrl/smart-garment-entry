import { describe, expect, it } from "vitest";
import {
  labelFontSizePxToPt,
  mapLabelFontFamilyToPdfGroup,
} from "./labelPdfFonts";

describe("mapLabelFontFamilyToPdfGroup", () => {
  it("maps sans-serif web fonts to Helvetica", () => {
    expect(mapLabelFontFamilyToPdfGroup("Arial")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("Verdana")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("Tahoma")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("Trebuchet MS")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("Comic Sans MS")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup(undefined)).toBe("helvetica");
  });

  it("maps serif fonts to Times", () => {
    expect(mapLabelFontFamilyToPdfGroup("Times New Roman")).toBe("times");
    expect(mapLabelFontFamilyToPdfGroup("Georgia")).toBe("times");
    expect(mapLabelFontFamilyToPdfGroup("Times-Roman")).toBe("times");
  });

  it("maps monospace fonts to Courier", () => {
    expect(mapLabelFontFamilyToPdfGroup("Courier New")).toBe("courier");
    expect(mapLabelFontFamilyToPdfGroup("Courier")).toBe("courier");
  });
});

describe("labelFontSizePxToPt", () => {
  it("converts px→pt without the old 14pt ceiling", () => {
    expect(labelFontSizePxToPt(20)).toBeCloseTo(15, 5);
    expect(labelFontSizePxToPt(18)).toBeCloseTo(13.5, 5);
    expect(labelFontSizePxToPt(8)).toBeCloseTo(6, 5);
  });

  it("clamps only extreme values", () => {
    expect(labelFontSizePxToPt(2)).toBe(4);
    expect(labelFontSizePxToPt(100)).toBe(48);
  });
});
