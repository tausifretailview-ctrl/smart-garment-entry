import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ops: [] as unknown[][],
  result: { data: null as unknown, error: null as unknown },
  pages: [] as Array<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      db.ops.push(["from", table]);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "ilike", "order", "limit", "range"]) {
        b[m] = (...args: unknown[]) => (db.ops.push([m, ...args]), b);
      }
      b.maybeSingle = async () => db.result;
      b.then = (resolve: (v: unknown) => void) => resolve(db.pages.length ? db.pages.shift() : db.result);
      return b;
    },
  },
}));

import {
  fetchProductCatalogForImport,
  fetchPurchaseVariantById,
  fetchPurchaseVariantsByBarcode,
  fetchPurchaseVariantsForProducts,
  PRODUCT_SEARCH_LIMIT,
  searchPurchaseProducts,
  searchPurchaseVariants,
} from "@/lib/data/purchaseVariantLookups";

const has = (...op: unknown[]) => expect(db.ops).toContainEqual(op);

/** Plan Phase 4, S4 + D6: Purchase Entry's product / size lookups, once. */
describe("purchase variant lookups", () => {
  beforeEach(() => {
    db.ops = [];
    db.result = { data: [], error: null };
    db.pages = [];
  });

  it("product search is limited (ids go into the next request's URL) and skips the recycle bin", async () => {
    await searchPurchaseProducts("org-1", "pug");
    has("or", "product_name.ilike.%pug%,brand.ilike.%pug%,style.ilike.%pug%");
    has("limit", PRODUCT_SEARCH_LIMIT);
    has("is", "deleted_at", null);
    db.ops = [];
    await searchPurchaseProducts("org-1", "pug", { includeCategory: true });
    has("or", "product_name.ilike.%pug%,brand.ilike.%pug%,style.ilike.%pug%,category.ilike.%pug%");
  });

  it("variant search: exact name -> those products only; else ids + barcode; else barcode", async () => {
    await searchPurchaseVariants("org-1", { query: "PUG1", productIds: ["p1"], exactNameMatch: true, limit: 100 });
    has("in", "product_id", ["p1"]);
    has("limit", 100);
    db.ops = [];
    await searchPurchaseVariants("org-1", { query: "PUG", productIds: ["p1", "p2"], exactNameMatch: false, limit: 300 });
    has("or", "barcode.ilike.%PUG%,product_id.in.(p1,p2)");
    has("limit", 300);
    db.ops = [];
    await searchPurchaseVariants("org-1", { query: "890", productIds: [], exactNameMatch: false, limit: 100 });
    has("ilike", "barcode", "%890%");
  });

  it("every lookup skips sizes and products in the recycle bin", async () => {
    await fetchPurchaseVariantsByBarcode("org-1", "890123");
    has("eq", "barcode", "890123");
    has("is", "deleted_at", null);
    has("is", "products.deleted_at", null);
    db.ops = [];
    await fetchPurchaseVariantById("org-1", "v1");
    has("eq", "id", "v1");
    has("is", "products.deleted_at", null);
    db.ops = [];
    await fetchPurchaseVariantsForProducts("org-1", ["p1", "p1", ""]);
    has("in", "product_id", ["p1"]);
    has("is", "deleted_at", null);
    has("eq", "active", true);
  });

  it("sizes for products: optionally includes sizes whose active flag was never set; none for no ids", async () => {
    await fetchPurchaseVariantsForProducts("org-1", ["p1"], { includeNullActive: true });
    has("or", "active.eq.true,active.is.null");
    db.ops = [];
    expect(await fetchPurchaseVariantsForProducts("org-1", [])).toEqual([]);
    expect(db.ops).toEqual([]);
  });

  it("a failed read throws", async () => {
    db.result = { data: null, error: { message: "timeout" } };
    await expect(fetchPurchaseVariantsByBarcode("org-1", "1")).rejects.toMatchObject({ message: "timeout" });
    await expect(searchPurchaseProducts("org-1", "a")).rejects.toMatchObject({ message: "timeout" });
  });

  it("import catalog: reads every page in id order; a failed page throws", async () => {
    db.pages = [
      { data: [{ id: "p1" }, { id: "p2" }], error: null },
      { data: [{ id: "p3" }, { id: "p4" }], error: null },
      { data: [{ id: "p5" }], error: null },
    ];
    expect((await fetchProductCatalogForImport("org-1", 2)).map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    has("order", "id", { ascending: true });
    has("range", 0, 1);
    has("range", 4, 5);
    db.pages = [{ data: [{ id: "p1" }, { id: "p2" }], error: null }, { data: null, error: { message: "timeout" } }];
    await expect(fetchProductCatalogForImport("org-1", 2)).rejects.toMatchObject({ message: "timeout" });
  });
});
