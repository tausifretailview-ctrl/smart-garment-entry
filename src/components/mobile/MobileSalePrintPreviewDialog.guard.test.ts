import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("mobile sale PDF preview", () => {
  it("uses POS vs Sale print config and a compact phone dialog", () => {
    const src = readFileSync(join(here, "MobileSalePrintPreviewDialog.tsx"), "utf8");
    expect(src).toContain("resolveSalePreviewPrintConfig");
    expect(src).toContain("compactLayout");
    expect(src).toContain("documentType");
    expect(src).toContain("thermalPaper");
  });

  it("scales the preview off the capture node so Download PDF is full-size", () => {
    const src = readFileSync(join(here, "../PrintPreviewDialog.tsx"), "utf8");
    expect(src).toContain("compactLayout");
    expect(src).toContain("scaleWrapRef");
    expect(src).toContain("wrap.style.transform = 'none'");
    expect((src.match(/function normalizePreviewFormat/g) || []).length).toBe(1);
    expect(src).not.toMatch(/printRef[\s\S]{0,200}transform: selectedFormat === 'thermal'/);
  });
});
