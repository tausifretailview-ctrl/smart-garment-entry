import { describe, expect, it } from "vitest";
import { catalogSearchIlikeTerm, normalizeProductSearchTerm } from "./productDashboardBarcodeSearch";

describe("catalogSearchIlikeTerm", () => {
  it("returns null for blank input", () => {
    expect(catalogSearchIlikeTerm("   ")).toBeNull();
  });

  it("passes through a plain name search", () => {
    expect(catalogSearchIlikeTerm("  flexi  ")).toBe("flexi");
  });

  it("turns slash into a LIKE wildcard so FLEXI LS/100 matches space or slash names", () => {
    expect(catalogSearchIlikeTerm("FLEXI LS/100")).toBe("FLEXI LS%100");
  });

  it("collapses repeated slashes", () => {
    expect(catalogSearchIlikeTerm("FLEXI //NL")).toBe("FLEXI %NL");
  });
});

describe("normalizeProductSearchTerm", () => {
  it("trims whitespace without changing case or slash", () => {
    expect(normalizeProductSearchTerm("\tFLEXI LS/100\n")).toBe("FLEXI LS/100");
  });
});
