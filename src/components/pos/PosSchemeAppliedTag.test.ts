import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POS_SCHEME_APPLIED_TAG_LABEL, PosSchemeAppliedTag } from "./PosSchemeAppliedTag";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
  return readFileSync(resolve(here, rel), "utf8");
}

describe("PosSchemeAppliedTag", () => {
  it("keeps a short yellow scheme-applied label", () => {
    expect(POS_SCHEME_APPLIED_TAG_LABEL).toBe("Scheme applied");
    const source = readSrc("./PosSchemeAppliedTag.tsx");
    expect(source).toContain("bg-amber-100");
    expect(source).toContain("border-amber-400");
    expect(source).toContain("text-amber-900");
    expect(source).toContain("if (!applied) return null");
  });

  it("renders nothing until the scheme flag is set", () => {
    expect(renderToStaticMarkup(createElement(PosSchemeAppliedTag, { applied: false }))).toBe("");
    expect(renderToStaticMarkup(createElement(PosSchemeAppliedTag))).toBe("");
    const html = renderToStaticMarkup(createElement(PosSchemeAppliedTag, { applied: true }));
    expect(html).toContain("Scheme applied");
    expect(html).toContain("bg-amber-100");
    expect(html).toContain("border-amber-400");
    expect(html).toContain("text-amber-900");
  });

  it("shows on POS cart rows when categoryTierApplied is set", () => {
    const surfaces = [
      "../../pages/POSSales.tsx",
      "../tablet/TabletPOSLayout.tsx",
      "../mobile/MobilePOSCartItem.tsx",
      "../../pages/mobile/MobilePosBilling.tsx",
    ];
    for (const rel of surfaces) {
      const src = readSrc(rel);
      expect(src, rel).toContain("PosSchemeAppliedTag");
      expect(src, rel).toContain("categoryTierApplied");
    }
  });

  it("does not leak into print / invoice templates", () => {
    const printSurfaces = [
      "../InvoiceWrapper.tsx",
      "../RetailPosThermalReceipt80mm.tsx",
    ];
    for (const rel of printSurfaces) {
      const src = readSrc(rel);
      expect(src, rel).not.toContain("PosSchemeAppliedTag");
      expect(src, rel).not.toContain("Scheme applied");
    }
  });
});
