import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDuplicateProductGroups,
  compactProductNameKey,
  mapConsolidateProductsResult,
  pickCanonicalProductIndex,
} from "./productMergeUtils";

const here = dirname(fileURLToPath(import.meta.url));

describe("compactProductNameKey", () => {
  it("collapses FLEXI NL spacing/slash variants to one key", () => {
    expect(compactProductNameKey("FLEXI NL")).toBe("flexinl");
    expect(compactProductNameKey("FLEXI /NL")).toBe("flexinl");
    expect(compactProductNameKey("FLEXI / NL")).toBe("flexinl");
    expect(compactProductNameKey("flexi-nl")).toBe("flexinl");
  });

  it("keeps FLEXI-C2 distinct from FLEXI NL", () => {
    expect(compactProductNameKey("FLEXI-C2")).not.toBe(compactProductNameKey("FLEXI NL"));
    expect(compactProductNameKey("FLEXI C2")).toBe(compactProductNameKey("FLEXI-C2"));
  });
});

describe("pickCanonicalProductIndex", () => {
  it("picks most variants, then oldest created_at", () => {
    const rows = [
      { id: "b", product_name: "FLEXI /NL", created_at: "2026-01-01", variantCount: 2 },
      { id: "a", product_name: "FLEXI NL", created_at: "2025-06-01", variantCount: 5 },
      { id: "c", product_name: "FLEXI / NL", created_at: "2024-01-01", variantCount: 5 },
    ];
    // c and a both have 5; c is older → canonical
    expect(pickCanonicalProductIndex(rows)).toBe(2);
  });
});

describe("buildDuplicateProductGroups", () => {
  it("surfaces NL and C2 as separate groups with canonical first", () => {
    const groups = buildDuplicateProductGroups([
      { id: "nl1", product_name: "FLEXI NL", created_at: "2025-01-01", variantCount: 3 },
      { id: "nl2", product_name: "FLEXI /NL", created_at: "2025-02-01", variantCount: 1 },
      { id: "c1", product_name: "FLEXI-C2", created_at: "2025-01-01", variantCount: 2 },
      { id: "c2", product_name: "FLEXI C2", created_at: "2025-03-01", variantCount: 1 },
      { id: "solo", product_name: "UNIQUE ITEM", created_at: "2025-01-01", variantCount: 4 },
    ]);
    expect(groups).toHaveLength(2);
    const nl = groups.find((g) => g.compactName === "flexinl");
    const c2 = groups.find((g) => g.compactName === "flexic2");
    expect(nl?.canonicalName).toBe("FLEXI NL");
    expect(nl?.productIds[0]).toBe("nl1");
    expect(nl?.productNames).toEqual(["FLEXI NL", "FLEXI /NL"]);
    expect(c2?.canonicalName).toBe("FLEXI-C2");
    expect(c2?.productIds).toEqual(["c1", "c2"]);
  });
});

describe("mapConsolidateProductsResult", () => {
  it("maps snake_case RPC payload including conflicts", () => {
    const result = mapConsolidateProductsResult({
      groups_merged: 2,
      variants_moved: 3,
      products_retired: 1,
      dry_run: true,
      conflicts: [
        {
          duplicate_product_id: "dup",
          canonical_product_id: "can",
          canonical_name: "FLEXI NL",
          conflicting_variants: [
            {
              variant_id: "v1",
              barcode: "106",
              size: "M",
              color: "BLACK",
              stock_qty: 4,
            },
          ],
        },
      ],
    });
    expect(result.groupsMerged).toBe(2);
    expect(result.variantsMoved).toBe(3);
    expect(result.productsRetired).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(result.conflicts[0].conflictingVariants[0]).toEqual({
      variantId: "v1",
      barcode: "106",
      size: "M",
      color: "BLACK",
      stockQty: 4,
    });
  });
});

describe("source guards", () => {
  it("Bulk Product Update exposes Merge duplicate products dialog", () => {
    const src = readFileSync(resolve(here, "../pages/BulkProductUpdate.tsx"), "utf8");
    expect(src).toContain("MergeDuplicateProductsDialog");
    expect(src).toContain("Merge duplicate products");
  });

  it("migration defines fail-closed consolidate_duplicate_products", () => {
    const sql = readFileSync(
      resolve(here, "../../supabase/migrations/20260909190000_consolidate_duplicate_products.sql"),
      "utf8",
    );
    expect(sql).toContain("consolidate_duplicate_products");
    expect(sql).toContain("normalize_product_name_key");
    expect(sql).toContain("p_dry_run");
    expect(sql).toContain("auth.role() = 'anon'");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.consolidate_duplicate_products");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.consolidate_duplicate_products");
  });
});
