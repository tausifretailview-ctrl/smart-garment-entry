import { describe, expect, it } from "vitest";
import { barcodeLineCounts, labelListDescription } from "./labelListRows";

describe("labelListDescription", () => {
  it("joins set parts and skips blank or '-' ones", () => {
    expect(labelListDescription({ product_name: "SHIRT", category: "TOPS", style: "-", color: " ", brand: "ACME" })).toBe("SHIRT-TOPS-ACME");
    expect(labelListDescription({ product_name: "SHIRT" })).toBe("SHIRT");
  });
});

describe("barcodeLineCounts", () => {
  it("counts lines per barcode, ignoring lines without one", () => {
    const c = barcodeLineCounts([{ barcode: "1" }, { barcode: "2" }, { barcode: "1" }, { barcode: "" }, { barcode: null }]);
    expect(c.get("1")).toBe(2);
    expect(c.get("2")).toBe(1);
    expect(c.size).toBe(2);
  });
});
