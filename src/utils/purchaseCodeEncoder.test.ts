import { describe, expect, it } from "vitest";
import {
  encodePurchasePrice,
  encodePurchasePriceForLabel,
  getEffectivePurchasePrice,
  normalizePurchaseCodeAlphabet,
  resolvePurchaseCodeAlphabet,
  validatePurchaseCodeAlphabet,
} from "./purchaseCodeEncoder";

/** Rahmani NX handwritten mapping: 0=N 1=E 2=A 3=S 4=Y 5=F 6=I 7=T 8=O 9=W */
const RAHMANI_ALPHABET = "NEASYFITOW";

describe("getEffectivePurchasePrice extra percent", () => {
  it("leaves the purchase rate unchanged when extra % is disabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, false, 10)).toBe(500);
  });

  it("adds 10% on the purchase rate for the label alphabet (500 → 550)", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 10)).toBe(550);
  });

  it("does not apply a 0 extra percent even when enabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 0)).toBe(500);
  });

  it("applies extra % after GST when both are enabled", () => {
    // 500 + 5% GST = 525; + 10% = 577.5 → 578
    expect(getEffectivePurchasePrice(500, 5, true, true, 10)).toBe(578);
  });
});

describe("Rahmani NX purchase code alphabet", () => {
  it("encodes purchase 3190 as SEWN (3=S 1=E 9=W 0=N), not default 09DBKA26", () => {
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).toBe("SEWN");
    expect(encodePurchasePrice(3190.0, RAHMANI_ALPHABET)).toBe("SEWN");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET, "2026-09-12")).toBe("SEWN");
  });

  it("does not print the default ABCDEFGHIK mapping for 3190", () => {
    expect(encodePurchasePrice(3190, "ABCDEFGHIK")).toBe("DBKA");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).not.toBe("DBKA");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).not.toContain("09");
  });

  it("wraps month/year only when includeDate is opted in", () => {
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET, "2026-09-12", { includeDate: true })).toBe(
      "09SEWN26",
    );
    expect(encodePurchasePrice(3190, "ABCDEFGHIK", "2026-09-12", { includeDate: true })).toBe(
      "09DBKA26",
    );
  });

  it("accepts the 11-letter handwritten list NEASYFITOWN as NEASYFITOW", () => {
    expect(normalizePurchaseCodeAlphabet("NEASYFITOWN")).toBe(RAHMANI_ALPHABET);
    expect(encodePurchasePrice(3190, "NEASYFITOWN")).toBe("SEWN");
    expect(validatePurchaseCodeAlphabet("NEASYFITOWN")).toBe(true);
  });
});

describe("encodePurchasePrice with extra rate", () => {
  it("encodes 550 as FFA with ABCDEFGHIK (5=F, 5=F, 0=A)", () => {
    const encoded = encodePurchasePrice(550, "ABCDEFGHIK", "2026-08-19");
    expect(encoded).toBe("FFA");
  });

  it("still embeds FFA when date wrapping is on", () => {
    const encoded = encodePurchasePrice(550, "ABCDEFGHIK", "2026-08-19", { includeDate: true });
    expect(encoded).toBe("08FFA26");
  });
});

describe("normalize / resolve alphabet", () => {
  it("uppercases and strips junk", () => {
    expect(normalizePurchaseCodeAlphabet(" neasyfitow ")).toBe(RAHMANI_ALPHABET);
  });

  it("falls back to ABCDEFGHIK only when the alphabet is empty or unusable", () => {
    expect(resolvePurchaseCodeAlphabet("")).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet(undefined)).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet("ABC")).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet(RAHMANI_ALPHABET)).toBe(RAHMANI_ALPHABET);
  });

  it("does not silently swap a valid custom alphabet for the default", () => {
    expect(encodePurchasePrice(100, RAHMANI_ALPHABET)).toBe("ENN");
    expect(encodePurchasePrice(100, "ABCDEFGHIK")).toBe("BAA");
  });
});

describe("encodePurchasePriceForLabel", () => {
  it("uses the org alphabet and purchase amount, ignoring sale/MRP", () => {
    expect(encodePurchasePriceForLabel(3190, RAHMANI_ALPHABET)).toBe("SEWN");
  });

  it("returns empty when there is no purchase price", () => {
    expect(encodePurchasePriceForLabel(0, RAHMANI_ALPHABET)).toBe("");
    expect(encodePurchasePriceForLabel(null, RAHMANI_ALPHABET)).toBe("");
  });
});
