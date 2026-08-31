import { describe, expect, it } from "vitest";
import {
  findDefaultPresetForMode,
  inferPrecisionPrintMode,
  presetMatchesPrintMode,
  shouldApplyPurchaseLanding,
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

  it("trusts explicit footwear mode", () => {
    expect(
      inferPrecisionPrintMode({
        name: "Box Pair",
        printMode: "footwear",
      }),
    ).toBe("footwear");
  });

  it("infers footwear from precision pro / box+pair names", () => {
    expect(inferPrecisionPrintMode({ name: "Precision Pro TSC Box+Pair" })).toBe("footwear");
  });

  it("does not treat stale print_mode=thermal as 1-up when name is 3-up", () => {
    expect(
      inferPrecisionPrintMode({
        name: "32×19mm 3-Up",
        printMode: "thermal",
        thermalCols: 3,
      }),
    ).toBe("thermal3up");
  });

  it("does not treat stale print_mode=thermal as 1-up when thermal_cols is 3", () => {
    expect(
      inferPrecisionPrintMode({
        name: "Shop labels",
        printMode: "thermal",
        thermalCols: 3,
      }),
    ).toBe("thermal3up");
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

describe("shouldApplyPurchaseLanding", () => {
  it("applies once per purchase navigation and ignores later preset refreshes", () => {
    expect(shouldApplyPurchaseLanding(null, "nav-1")).toBe(true);
    expect(shouldApplyPurchaseLanding("nav-1", "nav-1")).toBe(false);
    expect(shouldApplyPurchaseLanding("nav-1", "nav-2")).toBe(true);
    expect(shouldApplyPurchaseLanding("nav-1", null)).toBe(false);
  });
});
