import { describe, expect, it } from "vitest";
import { sizeMatrixKey, sortSizes } from "./sizeSort";

describe("sortSizes", () => {
  it("orders letter sizes with 2XL after XXL (not at end)", () => {
    expect(sortSizes(["5XL", "L", "2XL", "XL", "XXL", "3XL"])).toEqual([
      "L",
      "XL",
      "XXL",
      "2XL",
      "3XL",
      "5XL",
    ]);
  });

  it("normalizes XXXL to 3XL position", () => {
    expect(sortSizes(["XXXL", "XL", "L"])).toEqual(["L", "XL", "XXXL"]);
  });
});

describe("sizeMatrixKey", () => {
  it("treats 06 and 6 as the same column", () => {
    expect(sizeMatrixKey("06")).toBe(sizeMatrixKey("6"));
  });
});
