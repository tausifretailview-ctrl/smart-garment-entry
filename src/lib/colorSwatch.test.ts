import { describe, expect, it } from "vitest";
import { colorSwatchesFor, isLightSwatch } from "./colorSwatch";

describe("colorSwatchesFor", () => {
  it("maps common shop colour names", () => {
    expect(colorSwatchesFor("NAVY BLUE")).toEqual(["#1a2a5a"]);
    expect(colorSwatchesFor("Rani Pink")).toEqual(["#e0218a"]);
    expect(colorSwatchesFor("off-white")).toEqual(["#f5f1e6"]);
    expect(colorSwatchesFor("  white ")).toEqual(["#ffffff"]);
  });

  it("splits combined colours into up to three swatches", () => {
    expect(colorSwatchesFor("RED/BLACK")).toEqual(["#d32f2f", "#111111"]);
    expect(colorSwatchesFor("Red & White")).toEqual(["#d32f2f", "#ffffff"]);
  });

  it("falls back to a shade's base word", () => {
    expect(colorSwatchesFor("DARK MAROON")).toEqual(["#7b1e2b"]);
  });

  it("returns nothing for blanks, multi colour and unknown names", () => {
    expect(colorSwatchesFor("")).toEqual([]);
    expect(colorSwatchesFor(null)).toEqual([]);
    expect(colorSwatchesFor("MULTI")).toEqual([]);
    expect(colorSwatchesFor("D-14")).toEqual([]);
  });

  it("flags light colours for a border", () => {
    expect(isLightSwatch("#ffffff")).toBe(true);
    expect(isLightSwatch("#111111")).toBe(false);
  });
});
