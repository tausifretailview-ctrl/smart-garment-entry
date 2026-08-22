import { describe, expect, it } from "vitest";
import { expandBarcodeScanCandidates, isDoubledNumericBarcode } from "./barcodeScanResolve";

describe("expandBarcodeScanCandidates", () => {
  it("returns normalized trim for a normal barcode", () => {
    expect(expandBarcodeScanCandidates("  0040015241  ")).toEqual(["0040015241"]);
  });

  it("strips scanner control characters", () => {
    expect(expandBarcodeScanCandidates("0040015241\r\n")).toEqual(["0040015241"]);
  });

  it("adds first half when numeric barcode is exactly doubled", () => {
    expect(expandBarcodeScanCandidates("00400152410040015241")).toEqual([
      "00400152410040015241",
      "0040015241",
    ]);
  });

  it("does not split when halves differ", () => {
    expect(expandBarcodeScanCandidates("00400152420040015243")).toEqual([
      "00400152420040015243",
    ]);
  });

  it("does not split odd-length numeric codes", () => {
    expect(expandBarcodeScanCandidates("123456789")).toEqual(["123456789"]);
  });
});

describe("isDoubledNumericBarcode", () => {
  it("detects KS Footwear doubled scan", () => {
    expect(isDoubledNumericBarcode("00400152410040015241")).toBe(true);
  });

  it("rejects single barcode", () => {
    expect(isDoubledNumericBarcode("0040015241")).toBe(false);
  });
});
