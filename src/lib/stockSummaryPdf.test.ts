import { describe, expect, it } from "vitest";
import { cssColorToRgb } from "./stockSummaryPdf";

describe("cssColorToRgb", () => {
  it("parses 6- and 3-digit hex", () => {
    expect(cssColorToRgb("#1a2a5a")).toEqual([26, 42, 90]);
    expect(cssColorToRgb("#fff")).toEqual([255, 255, 255]);
  });

  it("returns null for empty or invalid colours", () => {
    expect(cssColorToRgb("")).toBeNull();
    expect(cssColorToRgb("#12")).toBeNull();
  });
});
