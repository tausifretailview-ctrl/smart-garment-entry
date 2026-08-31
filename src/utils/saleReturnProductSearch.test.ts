import { describe, expect, it } from "vitest";
import { matchesProductSearchFields } from "@/utils/productSearch";
import {
  filterSaleReturnProducts,
  flattenSaleReturnSearchRows,
  groupSaleReturnVariantsByProduct,
  resolveSaleReturnBarcodeEnterAction,
  shouldSaleReturnShowNameDropdown,
  type SaleReturnSearchProduct,
  type SaleReturnSearchVariant,
} from "./saleReturnProductSearch";

/** Trendzo-shaped catalogue: category carries the type, product name often does not. */
const PRODUCTS: SaleReturnSearchProduct[] = [
  { id: "p1", product_name: "AARIBA", brand: "GAZIBO", category: "T-Shirt", style: null },
  { id: "p2", product_name: "BOXY PRINTED", brand: "Z DESINER", category: "T-Shirt", style: "PRINTED" },
  { id: "p3", product_name: "BOOTCUT JEANS", brand: "TB", category: "Jeans", style: null },
  { id: "p4", product_name: "KOREAN PANT", brand: "Z DESINER", category: "Pant", style: null },
  { id: "p5", product_name: "OFFER T-SHIRT", brand: "TB", category: null, style: null },
  { id: "p6", product_name: "TRACK PANT", brand: "TB", category: "Track", style: null },
  { id: "p7", product_name: "TRACK SUIT", brand: "GAZIBO", category: "Track", style: null },
];

const VARIANTS: SaleReturnSearchVariant[] = [
  { product_id: "p1", size: "M", barcode: "20001629" },
  { product_id: "p2", size: "L", barcode: "20001630" },
  { product_id: "p3", size: "32", barcode: "20001631" },
  { product_id: "p4", size: "34", barcode: "20001632" },
  { product_id: "p5", size: "S", barcode: "20001633" },
  { product_id: "p6", size: "M", barcode: "20001634" },
  { product_id: "p6", size: "L", barcode: "20001635" },
  { product_id: "p7", size: "XL", barcode: "20001636" },
];

const byProduct = groupSaleReturnVariantsByProduct(VARIANTS);
const ids = (rows: SaleReturnSearchProduct[]) => rows.map((r) => r.id).sort();

/** The filter Sale Return used before this change: name + brand + barcode only. */
function legacyFilter(term: string): SaleReturnSearchProduct[] {
  const search = term.toLowerCase();
  return PRODUCTS.filter((product) => {
    if (!term) return true;
    const barcodeMatch = VARIANTS.filter((v) => v.product_id === product.id).some((v) =>
      v.barcode?.toLowerCase().includes(search),
    );
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      barcodeMatch
    );
  });
}

describe("Sale Return product search — category matching (the reported gap)", () => {
  it("finds products by category even when the name does not contain the term", () => {
    const found = filterSaleReturnProducts(PRODUCTS, byProduct, "T-Shirt");
    // p1 AARIBA and p2 BOXY PRINTED are only reachable via category.
    expect(ids(found)).toContain("p1");
    expect(ids(found)).toContain("p2");
    // p5 still matches on name.
    expect(ids(found)).toContain("p5");
    expect(ids(found)).not.toContain("p3");
    expect(ids(found)).not.toContain("p4");
  });

  it("is a real improvement over the previous filter", () => {
    const before = ids(legacyFilter("T-Shirt"));
    const after = ids(filterSaleReturnProducts(PRODUCTS, byProduct, "T-Shirt"));
    // Old behaviour found only the product whose NAME contained the term.
    expect(before).toEqual(["p5"]);
    expect(after).toEqual(["p1", "p2", "p5"]);
  });

  it("matches the same products POS Sales search would match", () => {
    for (const term of ["T-Shirt", "Jeans", "Z DESINER", "PRINTED", "AARIBA"]) {
      const posMatches = PRODUCTS.filter((p) =>
        matchesProductSearchFields(
          {
            product_name: p.product_name,
            brand: p.brand ?? "",
            category: p.category ?? "",
            style: p.style ?? "",
          },
          term,
        ),
      );
      const saleReturnMatches = filterSaleReturnProducts(PRODUCTS, byProduct, term);
      // Sale Return may additionally match on sold-variant barcode/size, so POS matches
      // must be a subset of what Sale Return finds.
      for (const p of posMatches) {
        expect(ids(saleReturnMatches), `${term} -> ${p.id}`).toContain(p.id);
      }
    }
  });
});

describe("Sale Return product search — existing behaviour preserved", () => {
  it("still finds by brand", () => {
    expect(ids(filterSaleReturnProducts(PRODUCTS, byProduct, "Z DESINER"))).toEqual(["p2", "p4"]);
  });

  it("still finds by exact barcode on a sold variant", () => {
    expect(ids(filterSaleReturnProducts(PRODUCTS, byProduct, "20001631"))).toEqual(["p3"]);
  });

  it("still finds by product name", () => {
    expect(ids(filterSaleReturnProducts(PRODUCTS, byProduct, "BOOTCUT"))).toEqual(["p3"]);
  });

  it("returns the full sold-products list for an empty term", () => {
    expect(filterSaleReturnProducts(PRODUCTS, byProduct, "")).toHaveLength(PRODUCTS.length);
    expect(filterSaleReturnProducts(PRODUCTS, byProduct, "   ")).toHaveLength(PRODUCTS.length);
  });

  it("never widens beyond the sold-products candidate set", () => {
    // A product that was never sold is not in the input list, so it can never appear —
    // Sale Return's "you may only return what was sold" rule is untouched.
    const soldOnly = PRODUCTS.filter((p) => p.id !== "p1");
    const found = filterSaleReturnProducts(soldOnly, byProduct, "T-Shirt");
    expect(ids(found)).not.toContain("p1");
  });

  it("ranks an exact product-name hit above incidental matches", () => {
    const found = filterSaleReturnProducts(PRODUCTS, byProduct, "AARIBA");
    expect(found[0].id).toBe("p1");
  });

  it("finds TRACK by product name when no barcode is typed", () => {
    expect(ids(filterSaleReturnProducts(PRODUCTS, byProduct, "TRACK"))).toEqual(["p6", "p7"]);
  });

  it("never loses a result the previous filter would have found", () => {
    const terms = [
      "AARIBA", "BOXY", "BOOTCUT JEANS", "KOREAN", "OFFER",
      "TB", "GAZIBO", "Z DESINER",
      "20001629", "20001633",
      "t-shirt", "PANT", "printed",
    ];
    for (const term of terms) {
      const before = ids(legacyFilter(term));
      const after = ids(filterSaleReturnProducts(PRODUCTS, byProduct, term));
      for (const id of before) {
        expect(after, `"${term}" lost ${id}`).toContain(id);
      }
    }
  });
});

describe("Sale Return barcode box — POS-style name pick vs exact barcode", () => {
  it("opens the name dropdown for a word like TRACK, not for a barcode", () => {
    expect(shouldSaleReturnShowNameDropdown("TRACK")).toBe(true);
    expect(shouldSaleReturnShowNameDropdown("track pant")).toBe(true);
    expect(shouldSaleReturnShowNameDropdown("SHIRT")).toBe(true);
    expect(shouldSaleReturnShowNameDropdown("20001631")).toBe(false);
    expect(shouldSaleReturnShowNameDropdown("BHG215")).toBe(false);
    expect(shouldSaleReturnShowNameDropdown("")).toBe(false);
  });

  it("flattens TRACK into pickable sold-variant rows (sizes), never unsold products", () => {
    const rows = flattenSaleReturnSearchRows(PRODUCTS, byProduct, "TRACK");
    expect(rows.map((r) => `${r.product.id}:${r.variant.size}`)).toEqual([
      "p6:M",
      "p6:L",
      "p7:XL",
    ]);
    const soldOnly = PRODUCTS.filter((p) => p.id !== "p7");
    const soldOnlyRows = flattenSaleReturnSearchRows(soldOnly, byProduct, "TRACK");
    expect(soldOnlyRows.map((r) => r.product.id)).toEqual(["p6", "p6"]);
  });

  it("Enter on a name term picks the highlighted row instead of first-barcode-fallback", () => {
    const rows = flattenSaleReturnSearchRows(PRODUCTS, byProduct, "TRACK");
    expect(resolveSaleReturnBarcodeEnterAction("TRACK", rows.length, 1)).toEqual({
      kind: "pick-row",
      index: 1,
    });
    expect(resolveSaleReturnBarcodeEnterAction("TRACK", 0, 0)).toEqual({
      kind: "not-found",
      term: "TRACK",
    });
  });

  it("Enter on a barcode still uses exact lookup, even if a name list is open", () => {
    expect(resolveSaleReturnBarcodeEnterAction("20001631", 3, 0)).toEqual({
      kind: "exact-barcode",
      term: "20001631",
    });
  });
});
