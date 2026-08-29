import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "./BarcodePrinting.tsx"), "utf8");

describe("BarcodePrinting print-mode lock wiring", () => {
  it("routes background and user writers through takePrintModeWrite", () => {
    expect(page).toContain("takePrintModeWrite");
    expect(page).toContain('"user-click"');
    expect(page).toContain('"user-print"');
    expect(page).toContain('"settings-fetch"');
    expect(page).toContain('"preset-autoload"');
    expect(page).toContain('"preset-load"');
    expect(page).toContain('"new-purchase-nav"');
    expect(page).toContain('"org-change"');
    expect(page).toContain('"sheet-type"');
    expect(page).toContain("lockedPrintLayout");
  });
});
