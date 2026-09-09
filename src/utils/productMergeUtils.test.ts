import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDuplicateProductGroups,
  compactProductNameKey,
  findProductNameCollision,
  mapMergeTwoProductsResult,
  pickCanonicalProductIndex,
} from "./productMergeUtils";

const here = dirname(fileURLToPath(import.meta.url));

describe("compactProductNameKey", () => {
  it("collapses FLEXI NL spacing/slash variants to one key", () => {
    expect(compactProductNameKey("FLEXI NL")).toBe("flexinl");
    expect(compactProductNameKey("FLEXI /NL")).toBe("flexinl");
    expect(compactProductNameKey("FLEXI / NL")).toBe("flexinl");
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
    expect(pickCanonicalProductIndex(rows)).toBe(2);
  });
});

describe("buildDuplicateProductGroups", () => {
  it("exactPairsOnly drops mega groups like BABA SUIT but keeps NL/C2 pairs", () => {
    const baba = Array.from({ length: 5 }, (_, i) => ({
      id: `baba-${i}`,
      product_name: i % 2 === 0 ? "BABA SUIT" : "BABA  SUIT",
      created_at: `2025-01-0${i + 1}`,
      variantCount: 1,
    }));
    const rows = [
      ...baba,
      { id: "nl1", product_name: "FLEXI NL", created_at: "2025-01-01", variantCount: 3 },
      { id: "nl2", product_name: "FLEXI /NL", created_at: "2025-02-01", variantCount: 1 },
      { id: "c1", product_name: "FLEXI-C2", created_at: "2025-01-01", variantCount: 2 },
      { id: "c2", product_name: "FLEXI C2", created_at: "2025-03-01", variantCount: 1 },
    ];
    const all = buildDuplicateProductGroups(rows, false);
    expect(all.some((g) => g.compactName === "babasuit")).toBe(true);
    expect(all.some((g) => g.compactName === "flexinl")).toBe(true);

    const safe = buildDuplicateProductGroups(rows, true);
    expect(safe.map((g) => g.compactName).sort()).toEqual(["flexic2", "flexinl"]);
    expect(safe.find((g) => g.compactName === "flexinl")?.productIds[0]).toBe("nl1");
  });
});

describe("mapMergeTwoProductsResult", () => {
  it("maps snake_case RPC payload including conflicts", () => {
    const result = mapMergeTwoProductsResult({
      source_product_id: "src",
      target_product_id: "tgt",
      source_product_name: "FLEXI /NL",
      target_product_name: "FLEXI NL",
      variants_moved: 2,
      source_retired: true,
      dry_run: true,
      conflicting_variants: [
        {
          variant_id: "v1",
          barcode: "106",
          size: "M",
          color: "BLACK",
          stock_qty: 4,
        },
      ],
    });
    expect(result.sourceProductName).toBe("FLEXI /NL");
    expect(result.targetProductName).toBe("FLEXI NL");
    expect(result.variantsMoved).toBe(2);
    expect(result.sourceRetired).toBe(true);
    expect(result.conflictingVariants[0]).toEqual({
      variantId: "v1",
      barcode: "106",
      size: "M",
      color: "BLACK",
      stockQty: 4,
    });
  });
});

describe("findProductNameCollision", () => {
  const products = [
    { id: "a", productName: "FLEXI LS/100", variantCount: 1 },
    { id: "b", productName: "FLEXI LS100", variantCount: 2 },
    { id: "c", productName: "OTHER", variantCount: 1 },
  ];

  it("blocks rename when another active product already has that name", () => {
    const hit = findProductNameCollision(products, "flexi ls100", "a");
    expect(hit?.kind).toBe("exact");
    expect(hit?.product.id).toBe("b");
  });

  it("flags FLEXI LS/100 vs FLEXI LS100 as compact duplicates when names differ", () => {
    const hit = findProductNameCollision(
      [
        { id: "a", productName: "FLEXI LS/100", variantCount: 1 },
        { id: "b", productName: "FLEXI LS 100", variantCount: 1 },
      ],
      "FLEXI LS100",
      "a",
    );
    expect(hit?.kind).toBe("compact");
    expect(hit?.product.id).toBe("b");
  });

  it("ignores the product being renamed", () => {
    expect(
      findProductNameCollision(
        [{ id: "a", productName: "FLEXI LS/100", variantCount: 1 }],
        "FLEXI LS/100",
        "a",
      ),
    ).toBeNull();
  });
});

describe("source guards", () => {
  it("dialog uses FROM/INTO pickers and mergeTwoProducts", () => {
    const src = readFileSync(
      resolve(here, "../components/MergeDuplicateProductsDialog.tsx"),
      "utf8",
    );
    expect(src).toContain("Merge FROM");
    expect(src).toContain("INTO (kept");
    expect(src).toContain("findSafeMergeSuggestions");
    expect(src).toContain("mergeTwoProducts");
    expect(src).toContain("ProductMergeCombobox");
    expect(src).toContain("listOrgProductsForMerge");
    expect(src).not.toContain("consolidateDuplicateProducts");
  });

  it("Bulk Product Update opens Product & Brand Update window", () => {
    const src = readFileSync(resolve(here, "../pages/BulkProductUpdate.tsx"), "utf8");
    expect(src).toContain("ProductBrandUpdateDialog");
    expect(src).toContain("Product & Brand Update");
    expect(src).not.toContain("consolidateDuplicateProducts");
  });

  it("Product & Brand window has rename, dropdown merge, and brand tabs", () => {
    const src = readFileSync(
      resolve(here, "../components/ProductBrandUpdateDialog.tsx"),
      "utf8",
    );
    expect(src).toContain("Rename product");
    expect(src).toContain("Merge products");
    expect(src).toContain("FLEXI LS100");
    expect(src).toContain("renameOrgProductName");
    expect(src).toContain("renameOrgBrand");
    expect(src).toContain("ProductMergeCombobox");
    expect(src).toContain("MergeDuplicateProductsDialog");
    expect(src).not.toContain("consolidateDuplicateProducts");
  });

  it("migration defines fail-closed merge_two_products", () => {
    const sql = readFileSync(
      resolve(here, "../../supabase/migrations/20260909193000_merge_two_products.sql"),
      "utf8",
    );
    expect(sql).toContain("merge_two_products");
    expect(sql).toContain("p_source_product_id");
    expect(sql).toContain("p_target_product_id");
    expect(sql).toContain("p_dry_run");
    expect(sql).toContain("auth.role() = 'anon'");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.merge_two_products");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.merge_two_products");
  });
});
