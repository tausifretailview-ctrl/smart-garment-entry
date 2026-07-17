import { describe, expect, it } from "vitest";
import {
  getUniversalCodeScanWarning,
  isLikelyUniversalProductCode,
  validateIMEIWithContext,
} from "./imeiValidation";

describe("isLikelyUniversalProductCode", () => {
  it("detects 12 and 13 digit numeric codes", () => {
    expect(isLikelyUniversalProductCode("8901234567890")).toBe(true);
    expect(isLikelyUniversalProductCode("890123456789")).toBe(true);
  });

  it("does not flag typical IMEI lengths", () => {
    expect(isLikelyUniversalProductCode("356938035643809")).toBe(false);
    expect(isLikelyUniversalProductCode("ABC1234567890123")).toBe(false);
  });
});

describe("getUniversalCodeScanWarning", () => {
  it("returns warning for universal codes only", () => {
    expect(getUniversalCodeScanWarning("8901234567890")).toContain("universal");
    expect(getUniversalCodeScanWarning("356938035643809")).toBeNull();
  });
});

describe("validateIMEIWithContext", () => {
  it("returns warning when valid but looks like universal code", () => {
    const result = validateIMEIWithContext("8901234567890", 4, 25);
    expect(result.valid).toBe(true);
    expect(result.warning).toContain("universal");
  });
});
