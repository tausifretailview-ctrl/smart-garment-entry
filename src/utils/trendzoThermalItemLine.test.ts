import { describe, expect, it } from "vitest";
import { formatTrendzoThermalItemLine } from "./trendzoThermalItemLine";

describe("formatTrendzoThermalItemLine", () => {
  it("puts hyphenated product details and barcode on one line", () => {
    expect(
      formatTrendzoThermalItemLine("KURTI PLAZO-FANCY-ALMEERA-MAROON", "610001016"),
    ).toBe("KURTI PLAZO-FANCY-ALMEERA-MAROON 610001016");
  });

  it("collapses newline-split particulars into one line", () => {
    expect(
      formatTrendzoThermalItemLine("KURTI PLAZO-\nFANCY-\nALMEERA-\nMAROON", "610001017"),
    ).toBe("KURTI PLAZO- FANCY- ALMEERA- MAROON 610001017");
  });

  it("does not duplicate barcode when already in the name", () => {
    expect(
      formatTrendzoThermalItemLine("KURTI PLAZO 610001016", "610001016"),
    ).toBe("KURTI PLAZO 610001016");
  });

  it("returns barcode only when particulars are empty", () => {
    expect(formatTrendzoThermalItemLine("  ", "610001003")).toBe("610001003");
  });
});
