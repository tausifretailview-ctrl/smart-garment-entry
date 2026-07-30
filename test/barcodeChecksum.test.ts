import { describe, expect, it } from "vitest";
import {
  classifyBarcodeSource,
  isValidEan13,
  isValidEan8,
  isValidGtin14,
  isValidImeiLuhn,
  isValidUpcA,
} from "@/utils/barcodeChecksum";

describe("check-digit validators", () => {
  it("validates EAN-13", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("5901234123457")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
  });

  it("validates UPC-A", () => {
    expect(isValidUpcA("036000291452")).toBe(true);
    expect(isValidUpcA("036000291453")).toBe(false);
  });

  it("validates EAN-8", () => {
    expect(isValidEan8("96385074")).toBe(true);
    expect(isValidEan8("96385075")).toBe(false);
  });

  it("validates GTIN-14", () => {
    expect(isValidGtin14("10614141000415")).toBe(true);
    expect(isValidGtin14("10614141000416")).toBe(false);
  });

  it("validates IMEI by Luhn", () => {
    expect(isValidImeiLuhn("490154203237518")).toBe(true);
    expect(isValidImeiLuhn("490154203237519")).toBe(false);
    expect(isValidImeiLuhn("49015420323751")).toBe(false);
  });
});

describe("classifyBarcodeSource", () => {
  const org = { organizationNumber: 22, barcodeDigits: 9 };

  it("treats any non-digit code as external before check-digit maths", () => {
    const r = classifyBarcodeSource("SHHY62451C4Z263MA", org);
    expect(r.source).toBe("external");
    expect(r.reason).toBe("non-numeric");
  });

  it("treats valid GTINs as external", () => {
    expect(classifyBarcodeSource("4006381333931", org).source).toBe("external");
  });

  it("treats valid IMEIs as external", () => {
    expect(classifyBarcodeSource("490154203237518", org).source).toBe("external");
  });

  it("recognises the org generated series", () => {
    const r = classifyBarcodeSource("220001025", org);
    expect(r.source).toBe("generated");
    expect(r.reason).toBe("org-series");
    expect(r.needsReview).toBe(false);
  });

  it("flags unmatched numeric codes for review without guessing", () => {
    const r = classifyBarcodeSource("123456", org);
    expect(r.source).toBe("generated");
    expect(r.needsReview).toBe(true);
  });

  it("handles empty input", () => {
    expect(classifyBarcodeSource("", org).reason).toBe("empty");
  });
});
