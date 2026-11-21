import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIELD_SALES_ROOT_FONT_PX, FIELD_SALES_SAFE_TOP, fieldSalesSafeTopFallbackPx } from "./useFieldSalesShell";

describe("Field Sales app shell", () => {
  it("runs at a phone text size", () => {
    expect(FIELD_SALES_ROOT_FONT_PX).toBe(16);
  });

  it("clears the status bar: the WebView's inset, else a fallback in the Android 15+ app", () => {
    expect(FIELD_SALES_SAFE_TOP).toContain("env(safe-area-inset-top");
    expect(FIELD_SALES_SAFE_TOP).toContain("--fs-safe-top-fallback");
    const ua = (v: number) => `Mozilla/5.0 (Linux; Android ${v}; Pixel) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36`;
    expect(fieldSalesSafeTopFallbackPx(true, ua(15))).toBe(40);
    expect(fieldSalesSafeTopFallbackPx(true, ua(16))).toBe(40);
    // Before Android 15 the page is not drawn under the status bar.
    expect(fieldSalesSafeTopFallbackPx(true, ua(14))).toBe(0);
    // Browser / installed PWA: the browser keeps the status bar separate.
    expect(fieldSalesSafeTopFallbackPx(false, ua(15))).toBe(0);
    expect(fieldSalesSafeTopFallbackPx(true, "something else")).toBe(0);
  });

  it("every Field Sales header pads for the status bar", () => {
    for (const file of [
      "src/layouts/SalesmanLayout.tsx",
      "src/pages/salesman/SalesmanOrderEntry.tsx",
      "src/pages/salesman/SalesmanOrderView.tsx",
      "src/components/SalesmanSizeGridDialog.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain("paddingTop: FIELD_SALES_SAFE_TOP");
    }
  });
});
