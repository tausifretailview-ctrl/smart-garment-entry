import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMissingPricingSaleDiscPercentColumn,
  omitPricingSaleDiscPercentField,
} from "./pricingSaleDiscPercentColumn";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

describe("isMissingPricingSaleDiscPercentColumn", () => {
  it("matches PostgREST schema-cache error", () => {
    expect(
      isMissingPricingSaleDiscPercentColumn({
        code: "PGRST204",
        message: "Could not find the 'pricing_sale_disc_percent' column of 'products' in the schema cache",
      }),
    ).toBe(true);
  });

  it("matches Postgres undefined-column", () => {
    expect(
      isMissingPricingSaleDiscPercentColumn({
        code: "42703",
        message: "column products.pricing_sale_disc_percent does not exist",
      }),
    ).toBe(true);
  });

  it("ignores POS sale_discount_value errors", () => {
    expect(
      isMissingPricingSaleDiscPercentColumn({
        code: "PGRST204",
        message: "Could not find the 'sale_discount_value' column of 'products' in the schema cache",
      }),
    ).toBe(false);
  });
});

describe("omitPricingSaleDiscPercentField", () => {
  it("strips only the pending column", () => {
    expect(
      omitPricingSaleDiscPercentField({
        product_name: "KURTI",
        pricing_sale_disc_percent: 25,
        sale_discount_value: 10,
      }),
    ).toEqual({ product_name: "KURTI", sale_discount_value: 10 });
  });
});

describe("Sale Disc % persist vs POS catalogue discount", () => {
  it("writes pricing_sale_disc_percent from Product Entry, not sale_discount_*", () => {
    const page = readFileSync(join(root, "src/pages/ProductEntry.tsx"), "utf8");
    const dialog = readFileSync(join(root, "src/components/ProductEntryDialog.tsx"), "utf8");
    const panel = readFileSync(join(root, "src/components/ProductEditPanel.tsx"), "utf8");
    for (const src of [page, dialog, panel]) {
      expect(src).toContain("pricing_sale_disc_percent: normalizePricingSaleDiscPercent(pricingDiscPercent)");
      expect(src).toContain("isMissingPricingSaleDiscPercentColumn");
    }
  });
});
