// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("jspdf", () => ({ default: vi.fn() }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("@/components/precision-barcode/PrecisionLabelPreview", () => ({ PrecisionLabelPreview: () => null }));

import { toast } from "sonner";
import jsPDF from "jspdf";
import { exportLabelsPdf, type ExportLabelsPdfContext } from "@/lib/barcode/exportLabelsPdf";

const ctx = (over: Partial<ExportLabelsPdfContext>): ExportLabelsPdfContext =>
  ({
    labelItems: [],
    businessName: "ACME",
    sheetType: "custom",
    designFormat: "BT1",
    customWidth: 50,
    customHeight: 25,
    customCols: 4,
    customRows: 12,
    customGap: 0,
    printScale: 100,
    topOffset: 0,
    precisionSettings: { enabled: false },
    ...over,
  }) as ExportLabelsPdfContext;

/** The PDF export moved out of BarcodePrinting.tsx (Plan Phase 4, S4) keeps its checks. */
describe("exportLabelsPdf input checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses when no label has a quantity", async () => {
    await exportLabelsPdf(ctx({ labelItems: [{ qty: 0 }] as ExportLabelsPdfContext["labelItems"] }));
    expect(toast.error).toHaveBeenCalledWith("Please add at least one label with quantity > 0");
    expect(jsPDF).not.toHaveBeenCalled();
  });

  it.each([
    [{ customWidth: 301 }, "Width must be between 0 and 300mm"],
    [{ customHeight: 0 }, "Height must be between 0 and 300mm"],
    [{ customCols: 21 }, "Columns must be between 1 and 20"],
    [{ customRows: 51 }, "Rows must be between 1 and 50"],
    [{ customGap: 51 }, "Gap must be between 0 and 50mm"],
  ])("refuses a bad custom sheet size %j", async (bad, message) => {
    await exportLabelsPdf(ctx({ labelItems: [{ qty: 1 }] as ExportLabelsPdfContext["labelItems"], ...bad }));
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(jsPDF).not.toHaveBeenCalled();
  });

  it("Barcode Printing calls the module and no longer bundles its own PDF loaders", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    expect(page).toContain("exportLabelsPdf({");
    expect(page).not.toMatch(/import\("jspdf"\)|import\("html2canvas"\)/);
  });
});
