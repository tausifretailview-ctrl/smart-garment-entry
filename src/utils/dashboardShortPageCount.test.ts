import { describe, expect, it } from "vitest";
import { totalFromShortPage } from "./dashboardShortPageCount";

describe("totalFromShortPage", () => {
  it("knows the total from a short first page", () => {
    expect(totalFromShortPage(0, 7, 50)).toBe(7);
  });

  it("knows the total from a short later page", () => {
    expect(totalFromShortPage(100, 12, 50)).toBe(112);
  });

  it("is zero for an empty first page", () => {
    expect(totalFromShortPage(0, 0, 50)).toBe(0);
  });

  it("needs a count for a full page", () => {
    expect(totalFromShortPage(0, 50, 50)).toBeNull();
  });

  it("needs a count for an empty page past the first", () => {
    expect(totalFromShortPage(50, 0, 50)).toBeNull();
  });
});
