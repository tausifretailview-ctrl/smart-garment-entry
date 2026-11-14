// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { renderLabelSheet, type RenderLabelSheetContext } from "@/lib/barcode/renderLabelSheet";

const ctx = (over: Partial<RenderLabelSheetContext> = {}): RenderLabelSheetContext =>
  ({
    labelItems: [
      { barcode: "100001", qty: 3 },
      { barcode: "100002", qty: 2 },
      { barcode: "100003", qty: 0 },
    ],
    sheetType: "custom",
    designFormat: "BT1",
    labelConfig: {},
    customRows: 12,
    startPosition: 1,
    topOffset: 0,
    leftOffset: 0,
    bottomOffset: 0,
    rightOffset: 0,
    getLabelHTML: (item: { barcode: string }) => `<span class="lbl">${item.barcode}</span>`,
    hasAbsolutePositioning: () => false,
    getA4SheetDimensions: () => ({ cols: 4, rows: 12, width: 50, height: 25, gap: 0, rawGap: 0, rawWidth: 50, novaJetBrand: null }),
    getSheetPageMargins: () => ({ marginTop: 0, marginLeft: 0, marginBottom: 0, marginRight: 0 }),
    getThermalMultiUpCols: () => 1,
    getThermalMultiUpGap: () => 0,
    isThermal1Up: () => false,
    isThermalMultiUp: () => false,
    ...over,
  }) as unknown as RenderLabelSheetContext;

/** The sheet preview moved out of BarcodePrinting.tsx (Plan Phase 4, S4) draws the same labels. */
describe("renderLabelSheet", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="previewArea"></div><div id="printArea"></div>';
  });

  it("draws one label per quantity, skipping zero-quantity items", () => {
    renderLabelSheet("previewArea", ctx());
    const labels = [...document.querySelectorAll("#previewArea .lbl")].map((n) => n.textContent);
    expect(labels.filter((t) => t === "100001")).toHaveLength(3);
    expect(labels.filter((t) => t === "100002")).toHaveLength(2);
    expect(labels).not.toContain("100003");
  });

  it("with no labels, the empty sheet layout marks slots before the start position", () => {
    renderLabelSheet("previewArea", ctx({ labelItems: [], startPosition: 3 }));
    const cells = [...document.querySelectorAll("#previewArea .barcode-a4-layout-grid > div")].map((n) => n.textContent);
    expect(cells).toHaveLength(48); // 4 columns x 12 rows
    expect(cells.slice(0, 4)).toEqual(["—", "—", "3", "4"]);
  });

  it("does nothing when the target element is missing", () => {
    expect(() => renderLabelSheet("nope", ctx())).not.toThrow();
  });

  it("Barcode Printing calls the module", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    expect(readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8")).toContain("renderLabelSheet(targetElementId, {");
  });
});
