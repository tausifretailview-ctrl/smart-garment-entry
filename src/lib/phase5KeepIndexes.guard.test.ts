import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const EIGHT = [
  "idx_sale_items_sale",
  "idx_sale_items_saleid",
  "idx_purchase_items_bill",
  "idx_purchase_items_billid",
  "idx_purchase_items_sku",
  "idx_purchase_items_sku_id",
  "idx_product_variants_org",
  "idx_product_variants_organization_id",
];

describe("Phase 5 keep-all-eight", () => {
  const sql = readFileSync(join(root, "scripts/phase-5-keep-indexes.sql"), "utf8");
  const doc = readFileSync(join(root, "docs/phase-5-index-hygiene-2026-09.md"), "utf8");

  it("re-samples scans and never DROPs", () => {
    expect(sql).toMatch(/idx_scan/);
    expect(sql).not.toMatch(/DROP INDEX/i);
    for (const name of EIGHT) {
      expect(sql).toContain(name);
      expect(doc).toContain(name);
    }
  });

  it("records the keep-all-eight verdict", () => {
    expect(doc).toMatch(/Keep all eight/i);
    expect(doc).toMatch(/216,117,673/);
    expect(doc).toMatch(/166,486,927/);
    expect(doc).toMatch(/216,582,368/);
    expect(doc).toMatch(/166,570,592/);
  });
});
