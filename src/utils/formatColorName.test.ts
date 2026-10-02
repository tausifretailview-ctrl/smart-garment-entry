import { describe, expect, it } from "vitest";
import { distinctColorLabels, formatColorName } from "./formatColorName";

describe("formatColorName", () => {
  it("maps variant codes to color names", () => {
    expect(formatColorName("BK")).toBe("Black");
    expect(formatColorName("BR")).toBe("Brown");
    expect(formatColorName("bl")).toBe("Blue");
  });

  it("title-cases a full color name", () => {
    expect(formatColorName("BLACK")).toBe("Black");
    expect(formatColorName("")).toBe("");
  });
});

describe("distinctColorLabels", () => {
  it("keeps one label per color in first-seen order", () => {
    expect(distinctColorLabels(["BK", "BR", "bk", "NV", "", null])).toEqual([
      "Black",
      "Brown",
      "Navy",
    ]);
  });
});
