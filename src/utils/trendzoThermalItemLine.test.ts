import { describe, expect, it } from "vitest";
import { formatTrendzoThermalItemLine } from "./trendzoThermalItemLine";

describe("formatTrendzoThermalItemLine", () => {
  it("puts product details and barcode in one phrase instead of four hyphen rows", () => {
    expect(
      formatTrendzoThermalItemLine("KURTI PLAZO-FANCY-ALMEERA-MAROON", "610001016"),
    ).toBe("KURTI PLAZO FANCY ALMEERA MAROON\u00a0610001016");
  });

  it("collapses newline-split particulars", () => {
    expect(
      formatTrendzoThermalItemLine("KURTI PLAZO-\nFANCY-\nALMEERA-\nMAROON", "610001017"),
    ).toBe("KURTI PLAZO FANCY ALMEERA MAROON\u00a0610001017");
  });

  it("does not duplicate barcode when already in the name", () => {
    expect(formatTrendzoThermalItemLine("KURTI PLAZO 610001016", "610001016")).toBe(
      "KURTI PLAZO 610001016",
    );
  });

  it("returns barcode only when particulars are empty", () => {
    expect(formatTrendzoThermalItemLine("  ", "610001003")).toBe("610001003");
  });
});
