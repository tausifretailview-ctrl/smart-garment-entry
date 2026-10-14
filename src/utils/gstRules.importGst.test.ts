import { describe, expect, it } from "vitest";
import { resolveImportGstPercent } from "./gstRules";

describe("resolveImportGstPercent", () => {
  it("keeps a typed 0 instead of falling back", () => {
    expect(resolveImportGstPercent(0, 18)).toBe(0);
    expect(resolveImportGstPercent("0", 18)).toBe(0);
  });

  it("uses the fallback for blank cells", () => {
    expect(resolveImportGstPercent(undefined, 0)).toBe(0);
    expect(resolveImportGstPercent(null, 18)).toBe(18);
    expect(resolveImportGstPercent("  ", 5)).toBe(5);
  });

  it("reads numbers and percent strings", () => {
    expect(resolveImportGstPercent(5, 0)).toBe(5);
    expect(resolveImportGstPercent("12", 0)).toBe(12);
    expect(resolveImportGstPercent("18%", 0)).toBe(18);
  });

  it("falls back on junk", () => {
    expect(resolveImportGstPercent("abc", 0)).toBe(0);
  });
});
