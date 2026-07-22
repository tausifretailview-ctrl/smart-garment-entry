import { describe, expect, it } from "vitest";
import { resolveBarcodePrintTab } from "./resolveBarcodePrintTab";

describe("resolveBarcodePrintTab", () => {
  it("opens Standard when default is an a4_ preset", () => {
    expect(
      resolveBarcodePrintTab({
        defaultFormat: { sheetType: "a4_12x4" },
        presets: [{ isDefault: true }],
        precisionProEnabled: true,
      }),
    ).toBe("standard");
  });

  it("opens Standard when default is a Novajet A4 preset", () => {
    expect(
      resolveBarcodePrintTab({
        defaultFormat: { sheetType: "novajet48" },
        presets: [{ isDefault: true }],
        settingsDefaultBarTab: "precision",
        precisionProEnabled: true,
      }),
    ).toBe("standard");
  });

  it("opens Standard for custom multi-up A4 dimensions", () => {
    expect(
      resolveBarcodePrintTab({
        defaultFormat: {
          sheetType: "custom",
          customDimensions: { width: 48, height: 24, cols: 4, rows: 12, gap: 0 },
        },
        presets: [{ isDefault: true }],
      }),
    ).toBe("standard");
  });

  it("opens Precision when default is thermal and no A4 default", () => {
    expect(
      resolveBarcodePrintTab({
        defaultFormat: { sheetType: "thermal_50x38_1up" },
        presets: [{ isDefault: true }],
      }),
    ).toBe("precision");
  });

  it("honours explicit route openTab override", () => {
    expect(
      resolveBarcodePrintTab({
        routeRequestedTab: "precision",
        defaultFormat: { sheetType: "a4_12x4" },
      }),
    ).toBe("precision");
  });

  it("opens Precision for precision_1up / 2up / 3up settings", () => {
    expect(
      resolveBarcodePrintTab({
        settingsDefaultBarTab: "precision_2up",
        defaultFormat: { sheetType: "thermal_50x38_1up" },
      }),
    ).toBe("precision");
    expect(
      resolveBarcodePrintTab({
        settingsDefaultBarTab: "precision_3up",
        precisionProEnabled: true,
      }),
    ).toBe("precision");
  });
});
