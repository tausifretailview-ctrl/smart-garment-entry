import { describe, expect, it } from "vitest";
import {
  compactProductToken,
  expandProductSearchTerms,
  isExactProductNameQueryMatch,
  leadingProductToken,
  matchesCompactProductSearch,
  matchesProductSearchFields,
  matchesProductTokenBoundary,
  restrictProductsToExactNameMatches,
  scoreProductSearchMatch,
} from "../src/utils/productSearch";
import { buildSaleOrderProductGroupKey } from "../src/utils/saleOrderProductSearch";

describe("expandProductSearchTerms", () => {
  it("expands pul204 to spaced and hyphen forms", () => {
    expect(expandProductSearchTerms("Pul204")).toEqual(
      expect.arrayContaining(["pul204", "pul 204", "pul-204"]),
    );
  });
});

describe("compactProductToken", () => {
  it("normalizes spaced product codes", () => {
    expect(compactProductToken("PUL 204-PUL-RLX")).toBe("pul204pulrlx");
  });
});

describe("matchesCompactProductSearch", () => {
  it("matches pul204 against PUL 204 product name", () => {
    expect(
      matchesCompactProductSearch({ product_name: "PUL 204-PUL-RLX-LD" }, "pul204"),
    ).toBe(true);
  });
});

describe("scoreProductSearchMatch", () => {
  it("ranks exact compact code above partial brand match", () => {
    const exact = scoreProductSearchMatch({ product_name: "PUL 204-PUL-RLX-LD" }, "pul204");
    const partial = scoreProductSearchMatch({ product_name: "PUL227-PUL-RLX-LD" }, "pul204");
    expect(exact).toBeGreaterThan(partial);
  });

  it("ranks FL20 leading token above FL2067 when searching FL20", () => {
    const fl20 = scoreProductSearchMatch({ product_name: "FL20 - FL - RLX - MN - BR" }, "FL20");
    const fl2067 = scoreProductSearchMatch({ product_name: "FL2067-FL-RLX-LD 3-8" }, "FL20");
    expect(fl20).toBeGreaterThan(fl2067);
  });
});

describe("buildSaleOrderProductGroupKey", () => {
  it("keeps FL20 and FL2067 in separate groups for the same search", () => {
    const fl20 = {
      product_name: "FL20 - FL - RLX - MN - BR",
      brand: "RELAXO",
      category: "GENTS",
      style: "FL RLX",
    };
    const fl2067 = {
      product_name: "FL2067-FL-RLX-LD 3-8",
      brand: "RELAXO",
      category: "LADIES",
      style: "FL RLX",
    };
    const key20 = buildSaleOrderProductGroupKey(fl20, "FL20");
    const key2067 = buildSaleOrderProductGroupKey(fl2067, "FL20");
    expect(key20).not.toBe(key2067);
    expect(leadingProductToken(fl20.product_name)).toBe("fl20");
    expect(leadingProductToken(fl2067.product_name)).toBe("fl2067");
  });
});

describe("matchesProductTokenBoundary", () => {
  it("matches FL20 as a token but not the FL2067 prefix", () => {
    expect(
      matchesProductTokenBoundary({ product_name: "FL20 - FL - RLX - MN - BR" }, "FL20"),
    ).toBe(true);
    expect(
      matchesProductTokenBoundary({ product_name: "FL2067-FL-RLX-LD 3-8" }, "FL20"),
    ).toBe(false);
  });
});

describe("matchesProductSearchFields", () => {
  it("matches FL20 product and still allows FL2067 prefix browse", () => {
    expect(
      matchesProductSearchFields({ product_name: "FL20 - FL - RLX - MN - BR" }, "FL20"),
    ).toBe(true);
    expect(
      matchesProductSearchFields({ product_name: "FL2067-FL-RLX-LD 3-8" }, "FL20"),
    ).toBe(true);
  });
});

describe("restrictProductsToExactNameMatches", () => {
  const catalog = [
    { id: "a", product_name: "PUG193" },
    { id: "b", product_name: "PUG165" },
    { id: "c", product_name: "PUG179" },
    { id: "d", product_name: "PUG190" },
    { id: "e", product_name: "PUG193 - RLX - MN" },
  ];

  it("keeps only whole-name matches when user types PUG193", () => {
    const exact = restrictProductsToExactNameMatches(catalog, "PUG193");
    expect(exact?.map((p) => p.id).sort()).toEqual(["a", "e"]);
    expect(exact?.some((p) => p.product_name === "PUG165")).toBe(false);
  });

  it("does not restrict on partial prefix PUG1", () => {
    expect(restrictProductsToExactNameMatches(catalog, "PUG1")).toBeNull();
  });

  it("matches spaced whole codes via compact equality", () => {
    expect(isExactProductNameQueryMatch("PUG 193", "PUG193")).toBe(true);
    expect(isExactProductNameQueryMatch("PUG165", "PUG193")).toBe(false);
  });
});
