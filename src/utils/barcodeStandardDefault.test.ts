import { describe, it, expect } from "vitest";
import { namedSheetFitsLabel, standardDefaultIsCurrent } from "./barcodeStandardDefault";

describe("standardDefaultIsCurrent", () => {
  const saved = { defaultTemplate: "new4", sheetType: "novajet48" };

  it("is true only when template and sheet type are both the saved ones", () => {
    expect(standardDefaultIsCurrent(saved, { template: "new4", sheetType: "novajet48", customPresetName: null })).toBe(true);
    expect(standardDefaultIsCurrent(saved, { template: "65 LABEL", sheetType: "novajet48", customPresetName: null })).toBe(false);
  });

  it("is false when another sheet type is picked, so the button offers Save Default again", () => {
    // The reported case: default template still selected, shop's own 65-label sheet picked.
    expect(
      standardDefaultIsCurrent(saved, { template: "new4", sheetType: "custom", customPresetName: "65 LABEL SHEET 38*21" }),
    ).toBe(false);
  });

  it("compares the shop's own sheet by name", () => {
    const own = { defaultTemplate: "65 LABEL", sheetType: "custom", customPresetName: "65 LABEL SHEET 38*21" };
    expect(standardDefaultIsCurrent(own, { template: "65 LABEL", sheetType: "custom", customPresetName: "65 LABEL SHEET 38*21" })).toBe(true);
    expect(standardDefaultIsCurrent(own, { template: "65 LABEL", sheetType: "custom", customPresetName: "A4 40" })).toBe(false);
    expect(standardDefaultIsCurrent(own, { template: "65 LABEL", sheetType: "custom", customPresetName: null })).toBe(false);
  });

  it("is false with no saved default or no template selected", () => {
    expect(standardDefaultIsCurrent(null, { template: "new4", sheetType: "novajet48", customPresetName: null })).toBe(false);
    expect(standardDefaultIsCurrent(saved, { template: null, sheetType: "novajet48", customPresetName: null })).toBe(false);
  });
});

describe("namedSheetFitsLabel", () => {
  const sheet = { sheetType: "custom", selectedPreset: "65 LABEL SHEET 38*21", customWidth: 38.1, customHeight: 21.15 };

  it("keeps the shop's own sheet when the label design is the same size", () => {
    expect(namedSheetFitsLabel(sheet, 38.1, 21.15)).toBe(true);
    expect(namedSheetFitsLabel(sheet, 38, 21)).toBe(true);
  });

  it("does not keep it for a different label size", () => {
    expect(namedSheetFitsLabel(sheet, 39, 35)).toBe(false);
    expect(namedSheetFitsLabel(sheet, 38.1, 25)).toBe(false);
  });

  it("applies only to a named sheet, not a built-in or an unnamed custom size", () => {
    expect(namedSheetFitsLabel({ ...sheet, selectedPreset: "" }, 38.1, 21.15)).toBe(false);
    expect(namedSheetFitsLabel({ ...sheet, sheetType: "novajet65" }, 38.1, 21.15)).toBe(false);
  });
});
