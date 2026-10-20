import { describe, expect, it } from "vitest";
import { missingGroupSizePlaceholders } from "./sizeGroupGridSizes";

describe("missingGroupSizePlaceholders", () => {
  const variants = [
    { id: "v2", size: "2", color: "", pur_price: 372.49, sale_price: 430, mrp: 599 },
    { id: "v3", size: "3", color: "", pur_price: 372.49, sale_price: 430, mrp: 599 },
  ];

  it("adds group sizes the product has no variant for, with the product's prices", () => {
    const out = missingGroupSizePlaceholders({ variants, groupSizes: ["1", "2", " 3 ", "4"] });
    expect(out.map((p) => p.size)).toEqual(["1", "4"]);
    expect(out[0]).toMatchObject({
      color: "",
      pur_price: 372.49,
      sale_price: 430,
      mrp: 599,
      barcode: "",
      isCustomSize: true,
    });
  });

  it("matches sizes case-insensitively and ignores blanks / non-strings", () => {
    const out = missingGroupSizePlaceholders({
      variants: [{ id: "a", size: "xl", color: "" }],
      groupSizes: ["XL", "", null, "XXL"],
    });
    expect(out.map((p) => p.size)).toEqual(["XXL"]);
  });

  it("adds missing sizes per colour", () => {
    const out = missingGroupSizePlaceholders({
      variants: [
        { id: "a", size: "S", color: "RED", sale_price: 100 },
        { id: "b", size: "M", color: "BLUE", sale_price: 200 },
      ],
      groupSizes: ["S", "M"],
    });
    expect(out.map((p) => `${p.color}:${p.size}:${p.sale_price}`)).toEqual([
      "RED:M:100",
      "BLUE:S:200",
    ]);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
  });

  it("does not offer a size saved in another MRP tier as new", () => {
    const out = missingGroupSizePlaceholders({
      variants,
      savedVariants: [...variants, { size: "4", color: "" }],
      groupSizes: ["2", "3", "4", "5"],
    });
    expect(out.map((p) => p.size)).toEqual(["5"]);
  });

  it("returns nothing when the group has no sizes", () => {
    expect(missingGroupSizePlaceholders({ variants, groupSizes: null })).toEqual([]);
    expect(missingGroupSizePlaceholders({ variants, groupSizes: [] })).toEqual([]);
  });
});
