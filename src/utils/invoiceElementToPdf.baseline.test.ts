import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HTML2CANVAS_BASELINE_FIX_CSS } from "@/utils/invoiceElementToPdf";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "invoiceElementToPdf.ts"), "utf8");

describe("html2canvas baseline fix for thermal PDFs", () => {
  it("keeps html2canvas's 1x1 baseline probe inline despite Tailwind img { display: block }", () => {
    expect(HTML2CANVAS_BASELINE_FIX_CSS).toContain('img[width="1"][height="1"]');
    expect(HTML2CANVAS_BASELINE_FIX_CSS).toContain("display: inline !important");
  });

  it("installs the fix only around thermal captures and always removes it", () => {
    expect(src).toContain("thermalReceipt ? installHtml2CanvasBaselineFix()");
    expect(src).toMatch(/finally \{\s*releaseBaselineFix\(\);/);
  });
});
