import { describe, expect, it } from "vitest";
import { fitThermalHeaderFontPx, splitVastrakalaShopHeader } from "@/utils/vastrakalaThermalHeader";

describe("splitVastrakalaShopHeader", () => {
  it("splits long ERP name into title + tagline", () => {
    expect(splitVastrakalaShopHeader("VASTRAKALA SAREES & LADIES WEAR")).toEqual({
      title: "VASTRAKALA",
      tagline: "Sarees & Ladies Wear",
    });
  });

  it("uses default tagline when only one word", () => {
    expect(splitVastrakalaShopHeader("Vastrakala")).toEqual({
      title: "VASTRAKALA",
      tagline: "Sarees & Ladies Wear",
    });
  });
});

describe("fitThermalHeaderFontPx", () => {
  const title = { maxPx: 30, minPx: 18, emPerChar: 0.75 };

  it("prints a short name at the max size", () => {
    expect(fitThermalHeaderFontPx("PAYAL", 71, title)).toBe(30);
  });

  it("shrinks a long name so it fits beside the logo", () => {
    const px = fitThermalHeaderFontPx("VASTRAKALA", 46.5, title);
    expect(px).toBeLessThan(30);
    expect(px * 10 * 0.75).toBeLessThanOrEqual(46.5 * (96 / 25.4));
  });

  it("never goes below the min size", () => {
    expect(fitThermalHeaderFontPx("A VERY VERY LONG SHOP NAME HERE", 40, title)).toBe(18);
  });
});
