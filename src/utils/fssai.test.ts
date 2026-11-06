import { describe, expect, it } from "vitest";
import { appendFssaiToAddress, applyShopFssaiToSettings, customerFssaiPatch, fssaiWarning, getShopFssaiNumber, normalizeFssaiNumber } from "./fssai";

describe("fssai helpers", () => {
  it("normalizes spaces", () => {
    expect(normalizeFssaiNumber(" 1152 1999 000 123 ")).toBe("11521999000123");
  });
  it("reads shop number from bill_barcode_settings", () => {
    expect(getShopFssaiNumber({ bill_barcode_settings: { fssai_number: "11521999000123" } })).toBe("11521999000123");
    expect(getShopFssaiNumber(null)).toBe("");
  });
  it("appends a line under the address only when filled", () => {
    expect(appendFssaiToAddress("MUMBAI", "")).toBe("MUMBAI");
    expect(appendFssaiToAddress("MUMBAI\n", "123")).toBe("MUMBAI\nFSSAI Lic. No.: 123");
    expect(appendFssaiToAddress("", "123")).toBe("FSSAI Lic. No.: 123");
  });
  it("warns but does not block odd lengths", () => {
    expect(fssaiWarning("")).toBeNull();
    expect(fssaiWarning("11521999000123")).toBeNull();
    expect(fssaiWarning("123")).toMatch(/14 digits/);
  });
  it("only sends the customer column when it changed", () => {
    expect(customerFssaiPatch("", null)).toEqual({});
    expect(customerFssaiPatch("123", null)).toEqual({ fssai_number: "123" });
    expect(customerFssaiPatch("", "123")).toEqual({ fssai_number: null });
    expect(customerFssaiPatch("123", "123")).toEqual({});
  });
});

describe("applyShopFssaiToSettings", () => {
  it("adds the line only when the shop has a number", () => {
    const plain = { address: "MUMBAI", bill_barcode_settings: {} };
    expect(applyShopFssaiToSettings(plain)).toBe(plain);
    expect(applyShopFssaiToSettings({ address: "MUMBAI", bill_barcode_settings: { fssai_number: "11521999000123" } }).address).toBe(
      "MUMBAI\nFSSAI Lic. No.: 11521999000123",
    );
  });
});
