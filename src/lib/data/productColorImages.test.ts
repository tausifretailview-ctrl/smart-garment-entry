import { describe, expect, it } from "vitest";
import { colorKey, findCardForGuess, importNameGuesses, normalizeName } from "./productColorImages";

const card = (product_name: string, color: string, style: string | null = null) => ({ product_name, color, style });

describe("colour photos: import names", () => {
  it("normalises file names", () => {
    expect(normalizeName("rc_5001-Brown (1).JPG")).toBe("RC 5001 BROWN 1");
    expect(colorKey("p1", " Navy Blue ")).toBe("p1|navy blue");
  });

  it("reads the last 1–3 words as the colour, then the whole name; drops a copy number", () => {
    expect(importNameGuesses("RC 5001 NAVY BLUE (2).jpg")).toEqual([
      { article: "RC 5001 NAVY", color: "BLUE" },
      { article: "RC 5001", color: "NAVY BLUE" },
      { article: "RC", color: "5001 NAVY BLUE" },
      { article: "RC 5001 NAVY BLUE", color: "" },
    ]);
  });

  it("matches article (name or style) and colour, spaces and case ignored", () => {
    const cards = [card("RC 5001", "BROWN"), card("RC 5001", "BLACK"), card("MR50", "TAN", "AW-50"), card("KURTI 9", "")];
    expect(findCardForGuess(cards, { article: "RC5001", color: "brown" })).toBe(cards[0]);
    expect(findCardForGuess(cards, { article: "AW 50", color: "TAN" })).toBe(cards[2]);
    expect(findCardForGuess(cards, { article: "RC 5001", color: "RED" })).toBeNull();
    // No colour in the file name: only an article with one colour.
    expect(findCardForGuess(cards, { article: "RC 5001", color: "" })).toBeNull();
    expect(findCardForGuess(cards, { article: "MR50", color: "" })).toBe(cards[2]);
    expect(findCardForGuess(cards, { article: "KURTI 9", color: "" })).toBe(cards[3]);
  });
});
