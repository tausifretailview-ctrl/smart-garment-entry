import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { cleanProductName, groupDuplicateProductNames, productNameMergeKey } from "./productNameMerge";

describe("cleanProductName", () => {
  it("removes hidden characters, odd spaces, and extra spaces; keeps case", () => {
    expect(cleanProductName("  SHIRT ")).toBe("SHIRT");
    expect(cleanProductName("SHIRT ")).toBe("SHIRT");
    expect(cleanProductName("SH​IRT")).toBe("SHIRT");
    expect(cleanProductName("F.SHIRT  FULL")).toBe("F.SHIRT FULL");
    expect(cleanProductName("Shirt")).toBe("Shirt");
    expect(cleanProductName(null)).toBe("");
  });

  it("uses one key for spellings that differ only by spaces, case or hidden characters", () => {
    expect(productNameMergeKey("SHIRT ")).toBe(productNameMergeKey("shirt"));
    expect(productNameMergeKey("SHIRT")).not.toBe(productNameMergeKey("T SHIRT"));
  });
});

describe("groupDuplicateProductNames", () => {
  it("groups SHIRT / 'SHIRT ' / shirt under the most used spelling", () => {
    const groups = groupDuplicateProductNames(["SHIRT", "SHIRT", "SHIRT ", "shirt", "TSHIRT", "F.SHIRT"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical).toBe("SHIRT");
    expect(groups[0].variants).toEqual(["SHIRT", "SHIRT ", "shirt"]);
    expect(groups[0].productCount).toBe(4);
  });

  it("cleans a lone dirty spelling and skips clean unique names", () => {
    const groups = groupDuplicateProductNames(["JEANS ", "TRACK"]);
    expect(groups.map((g) => [g.variants, g.canonical])).toEqual([[["JEANS "], "JEANS"]]);
  });

  it("canonical spelling is itself cleaned when the most used one has spaces", () => {
    const groups = groupDuplicateProductNames(["SHIRT ", "SHIRT ", "SHIRT"]);
    expect(groups[0].canonical).toBe("SHIRT");
  });
});
