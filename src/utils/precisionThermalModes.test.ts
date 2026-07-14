import { describe, expect, it } from "vitest";
import {
  findDefaultPresetForMode,
  inferPrecisionPrintMode,
  presetMatchesPrintMode,
} from "./precisionThermalModes";

describe("inferPrecisionPrintMode", () => {
  it("trusts explicit thermal print_mode even when a4 cols/rows are stored", () => {
    expect(
      inferPrecisionPrintMode({
        name: "BLING JEWELLERY LABEL",
        printMode: "thermal",
        a4Cols: 4,
        a4Rows: 12,
        thermalCols: 1,
      }),
    ).toBe("thermal");
  });

  it("still recognizes explicit a4 mode", () => {
    expect(
      inferPrecisionPrintMode({
        name: "A4 grid",
        printMode: "a4",
        a4Cols: 4,
        a4Rows: 12,
      }),
    ).toBe("a4");
  });

  it("infers a4 from sheet dims only when printMode is missing", () => {
    expect(
      inferPrecisionPrintMode({
        name: "Legacy sheet",
        a4Cols: 5,
        a4Rows: 8,
      }),
    ).toBe("a4");
  });
});

describe("presetMatchesPrintMode / findDefaultPresetForMode", () => {
  const bling = {
    name: "BLING JEWELLERY LABEL",
    printMode: "thermal" as const,
    a4Cols: 4,
    a4Rows: 12,
    isDefault: true,
  };

  it("shows thermal default in Thermal 1-Up list without Show all modes", () => {
    expect(presetMatchesPrintMode(bling, "thermal")).toBe(true);
    expect(presetMatchesPrintMode(bling, "a4")).toBe(false);
    expect(findDefaultPresetForMode([bling], "thermal")?.name).toBe("BLING JEWELLERY LABEL");
  });
});
