import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProductTextOrFilter, expandProductSearchTerms } from "./productSearch";

const here = dirname(fileURLToPath(import.meta.url));

describe("mobile variant name search", () => {
  it("matches product name, category, brand, and style (e.g. KURTI)", () => {
    const or = buildProductTextOrFilter(expandProductSearchTerms("KURTI"));
    expect(or).toContain("product_name.ilike.%kurti%");
    expect(or).toContain("category.ilike.%kurti%");
    expect(or).toContain("brand.ilike.%kurti%");
    expect(or).toContain("style.ilike.%kurti%");
  });

  it("is used by mobile POS and purchase instead of nested products.product_name or()", () => {
    const pos = readFileSync(resolve(here, "../pages/mobile/MobilePosBilling.tsx"), "utf8");
    const purchase = readFileSync(resolve(here, "../pages/mobile/MobilePurchaseEntry.tsx"), "utf8");
    expect(pos).toContain("searchOrgVariantsByNameOrBarcode");
    expect(purchase).toContain("searchOrgVariantsByNameOrBarcode");
    expect(pos).not.toMatch(/barcode\.ilike\.%\$\{term\}%,products\.product_name\.ilike/);
    expect(purchase).not.toMatch(/barcode\.ilike\.%\$\{term\}%,products\.product_name\.ilike/);
  });
});
