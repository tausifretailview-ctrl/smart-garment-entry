import { describe, expect, it } from "vitest";
import { colorChipStyle, distinctColorLabels, formatColorName } from "./formatColorName";

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

describe("colorChipStyle", () => {
  it("paints black and red swatches with white text", () => {
    expect(colorChipStyle("Black")).toEqual({ backgroundColor: "#111827", color: "#ffffff" });
    expect(colorChipStyle("Red")).toEqual({ backgroundColor: "#dc2626", color: "#ffffff" });
    expect(colorChipStyle("Brown").color).toBe("#ffffff");
  });

  it("keeps light swatches readable", () => {
    expect(colorChipStyle("White").color).toBe("#1f2937");
    expect(colorChipStyle("Beije").backgroundColor).toBe(colorChipStyle("Beige").backgroundColor);
    expect(colorChipStyle("Navy pink").backgroundColor).toBe("#be185d");
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
