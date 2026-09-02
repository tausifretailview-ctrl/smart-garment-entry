/**
 * Phase 4 search-shape indexes — no new SECURITY DEFINER RPC.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20261201120000_phase4_search_shape_indexes.sql";

describe("Phase 4 search-shape indexes", () => {
  const sql = readFileSync(join(root, MIGRATION), "utf8");
  const saleOrderSearch = readFileSync(
    join(root, "src/utils/saleOrderProductSearch.ts"),
    "utf8",
  );
  const invoiceDash = readFileSync(join(root, "src/utils/invoiceDashboardData.ts"), "utf8");
  const posDash = readFileSync(join(root, "src/utils/posDashboardSales.ts"), "utf8");

  it("adds org-scoped product_name trigram (matches brand/style/category pattern)", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_products_org_name_trgm[\s\S]*organization_id uuid_ops, product_name gin_trgm_ops/,
    );
  });

  it("adds purchase_items barcode btree + trigram (no organization_id column)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_purchase_items_barcode\b/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_purchase_items_barcode_trgm/);
    expect(sql).not.toMatch(/purchase_items.*organization_id/);
  });

  it("does not create a client-facing search RPC", () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(sql).not.toMatch(/search_product/i);
  });

  it("sale-order product search no longer fires the 28-OR PostgREST filter", () => {
    expect(saleOrderSearch).not.toMatch(/buildProductTokenBoundaryOrFilter/);
    expect(saleOrderSearch).toMatch(/matchesProductTokenBoundary/);
    expect(saleOrderSearch).toMatch(/buildProductTextOrFilter/);
  });

  it("invoice and POS dashboard pagination use estimated count, not exact", () => {
    expect(invoiceDash).toMatch(/count: "estimated"/);
    expect(posDash).toMatch(/count: "estimated"/);
    expect(invoiceDash).not.toMatch(/select\("id", \{ count: "exact", head: true \}\)/);
    expect(posDash).not.toMatch(/select\("id", \{ count: "exact", head: true \}\)/);
  });
});
