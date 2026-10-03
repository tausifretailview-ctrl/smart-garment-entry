import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canMergeProducts, groupProductsByNameKey, type NameMergeProduct } from "./productNameStockMerge";

const p = (over: Partial<NameMergeProduct> & { id: string; productName: string }): NameMergeProduct => ({
  brand: null,
  style: null,
  category: null,
  createdAt: "2026-01-01",
  stock: 0,
  variantCount: 1,
  ...over,
});

describe("groupProductsByNameKey — look-alike names (ELN-DUP case)", () => {
  const rows = [
    p({ id: "1", productName: "ELN-DUP", stock: 12, variantCount: 4 }),
    p({ id: "2", productName: "ELN-Dup", stock: 3 }),
    p({ id: "3", productName: "eln dup ", stock: 0 }),
    p({ id: "4", productName: "ELN-DUP PANT", stock: 5 }),
    p({ id: "5", productName: "ELN-Dup&Pant", stock: 1 }),
    p({ id: "6", productName: "ELN.DUP", stock: 2, brand: "Other" }),
  ];

  it("groups names equal after case / spaces / - _ . / and keeps the one with most stock", () => {
    const groups = groupProductsByNameKey(rows);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.products.map((x) => x.id)).toEqual(["1", "2", "6", "3"]);
    expect(g.keepId).toBe("1");
    expect(g.canonical).toBe("ELN-DUP");
  });

  it("only same brand + style are ticked by default; a different brand is left for the user", () => {
    const g = groupProductsByNameKey(rows)[0];
    expect(g.suggestedSourceIds.sort()).toEqual(["2", "3"]);
    expect(g.suggestedSourceIds).not.toContain("6");
  });

  it("different words are not grouped (ELN-DUP PANT, ELN-Dup&Pant stay separate)", () => {
    const ids = groupProductsByNameKey(rows).flatMap((g) => g.products.map((x) => x.id));
    expect(ids).not.toContain("4");
    expect(ids).not.toContain("5");
  });

  it("no group for a single product", () => {
    expect(groupProductsByNameKey([p({ id: "x", productName: "SHIRT" })])).toEqual([]);
  });
});

describe("one product per name — every create / rename path checks it", () => {
  const root = resolve(__dirname, "../..");
  const read = (f: string) => readFileSync(resolve(root, f), "utf8");

  it("create paths snap or block on the product name only", () => {
    expect(read("src/components/ProductEntryDialog.tsx")).toContain("findProductNameMatch(");
    expect(read("src/pages/ProductEntry.tsx")).toContain("findProductNameMatch(");
    expect(read("src/pages/ProductEntry.tsx")).toContain("productNameMatchKey(typed)");
    expect(read("src/pages/PurchaseEntry.tsx")).toContain("catalogNameByKey.get(nameKey)");
  });

  it("rename paths block a name another product already has", () => {
    expect(read("src/components/ProductEditPanel.tsx")).toContain("findProductNameMatch(");
    expect(read("src/components/ProductBrandUpdateDialog.tsx")).toMatch(/if \(collision\) \{/);
  });

  it("merge is admin / manager only, in the app and in the database", () => {
    expect(canMergeProducts("admin")).toBe(true);
    expect(canMergeProducts("manager")).toBe(true);
    expect(canMergeProducts("user")).toBe(false);
    expect(canMergeProducts(null)).toBe(false);
    expect(read("src/components/MergeDuplicateProductNamesDialog.tsx")).toContain("disabled={!canMerge ||");
    const mig = read("supabase/migrations/20270103150000_merge_products_admin_manager_only.sql");
    expect(mig).toContain("gm.role IN ('admin'::public.app_role, 'manager'::public.app_role)");
    expect(mig).toContain("IF auth.uid() IS NOT NULL");
    // ids are checked against the organisation before the RPC
    expect(read("src/utils/productNameStockMerge.ts")).toContain('.eq("organization_id", params.organizationId)');
  });

  it("Stock Report merge moves stock with merge_products", () => {
    expect(read("src/utils/productNameStockMerge.ts")).toContain('rpc("merge_products"');
    expect(read("src/components/MergeDuplicateProductNamesDialog.tsx")).toContain("mergeProductsIntoKeep(");
  });
});
