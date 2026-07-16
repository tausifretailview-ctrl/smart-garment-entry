import { describe, expect, it } from "vitest";
import { buildPrecisionLabelDocument } from "./precisionLabelPrintDocument";

describe("buildPrecisionLabelDocument", () => {
  it("uses full row width for thermal 2-up pages", () => {
    const html = buildPrecisionLabelDocument(
      '<div class="precision-thermal-page precision-thermal-page-2up"></div>',
      {
        contentWidthMm: 78,
        pageHeightMm: 25,
        labelWidthMm: 38,
        isA4: false,
        thermalCols: 2,
      },
    );

    expect(html).toContain("@page { size: 78mm 25mm");
    expect(html).toContain("width: 78mm !important");
    expect(html).not.toContain("width: 38mm !important;\n      height: 25mm !important;\n      min-height: 25mm !important;\n      max-height: 25mm !important;\n      overflow: hidden !important;\n      box-sizing: border-box !important;\n      position: relative !important;\n      display: flex");
  });

  it("keeps single-label page width for thermal 1-up", () => {
    const html = buildPrecisionLabelDocument(
      '<div class="precision-thermal-page"></div>',
      {
        contentWidthMm: 100,
        pageHeightMm: 16,
        labelWidthMm: 100,
        isA4: false,
        thermalCols: 1,
      },
    );

    expect(html).toContain("@page { size: 100mm 16mm");
    expect(html).toContain("position: absolute !important");
  });

  it("lays out 2-up label cells side by side (relative, not stacked absolute)", () => {
    const html = buildPrecisionLabelDocument("<div></div>", {
      contentWidthMm: 78,
      pageHeightMm: 25,
      labelWidthMm: 38,
      isA4: false,
      thermalCols: 2,
    });

    expect(html).toContain("display: flex !important");
    expect(html).toContain("position: relative !important;\n      flex: 0 0 auto !important;");
  });
});
