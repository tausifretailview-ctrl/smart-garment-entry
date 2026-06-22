import { describe, expect, it } from "vitest";
import {
  compactProductToken,
  expandProductSearchTerms,
  matchesCompactProductSearch,
  scoreProductSearchMatch,
} from "../src/utils/productSearch";

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
});
